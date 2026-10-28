import { beforeAll, describe, expect, it } from "vitest";
import { getBalance, grantCredits, recentLedger, spendCredits } from "@/lib/billing/credits";
import type { Db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { FalQueueClient } from "@/lib/providers/fal";
import { FalAceStep } from "@/lib/providers/fal-music";
import type { LlmProvider } from "@/lib/providers/types";
import { buildLyricsPrompt, cleanLyrics, targetLines, writeLyrics } from "@/lib/songs/lyrics";
import { assertNoRealArtists, findBlockedArtist, SongSafetyError } from "@/lib/songs/safety";
import { createSong, getSong, listSongs, songView, updateSong } from "@/lib/songs/songs";
import { findGenre, stylePrompt } from "@/lib/songs/styles";
import { testDb } from "./helpers/db";

function llmReplying(reply: unknown | (() => unknown)): LlmProvider & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    modelId: "llama-3.3-70b",
    prompts,
    writeScript: async () => {
      throw new Error("unused");
    },
    completeJson: async (p: string) => {
      prompts.push(p);
      return typeof reply === "function" ? (reply as () => unknown)() : reply;
    },
  };
}

describe("real-artist safety", () => {
  it("catches names regardless of case and punctuation", () => {
    expect(findBlockedArtist("a song like ARIJIT-SINGH please")).toBe("arijit singh");
    expect(findBlockedArtist("in the voice of A.R. Rahman")).toBe("a r rahman");
    expect(findBlockedArtist("a song about kingfishers")).toBeUndefined();
    expect(findBlockedArtist("a mukeshwar temple bhajan")).toBeUndefined();
  });

  it("blocks what the LLM flags and refuses when the check fails", async () => {
    await expect(assertNoRealArtists(llmReplying({ realPerson: false }), ["rain in Mumbai"])).resolves.toBeUndefined();
    await expect(assertNoRealArtists(llmReplying({ realPerson: true, name: "Some Singer" }), ["sound like some singer"])).rejects.toThrow(SongSafetyError);
    await expect(assertNoRealArtists(llmReplying({ realPerson: false }), ["Taylor Swift style"])).rejects.toThrow(/Taylor Swift|taylor swift/);
    await expect(assertNoRealArtists(llmReplying(() => { throw new Error("down"); }), ["anything"])).rejects.toThrow(/try again/);
  });
});

describe("lyrics", () => {
  const genre = findGenre("kids-rhyme")!;

  it("prompts for language, structure, length and kid safety", () => {
    const prompt = buildLyricsPrompt({ topic: "brushing teeth", genre, mood: "happy", language: "hi", durationSec: 60, kidSafe: true });
    expect(prompt).toContain("Devanagari");
    expect(prompt).toContain("[Chorus]");
    expect(prompt).toContain(`About ${targetLines(60)} lines`);
    expect(prompt).toContain("young children");
    expect(prompt).toContain("Never mention or imitate real singers");
  });

  it("normalises section tags and spacing", () => {
    expect(cleanLyrics("(Verse 1)\r\n  line one  \n\n\n\nCHORUS:\nhook\n[bridge]\nend")).toBe("[Verse]\nline one\n\n[Chorus]\nhook\n[Bridge]\nend");
  });

  it("returns cleaned AI lyrics", async () => {
    const out = await writeLyrics(llmReplying({ title: " Daant Saaf ", lyrics: "Chorus:\nचमको चमको दाँत\nचमको चमको दाँत" }), { topic: "teeth", genre, mood: "", language: "hi", durationSec: 30 });
    expect(out).toEqual({ title: "Daant Saaf", lyrics: "[Chorus]\nचमको चमको दाँत\nचमको चमको दाँत" });
  });

  it("builds style prompts without artist names", () => {
    expect(stylePrompt(genre, "happy")).toMatch(/nursery rhyme.*happy mood$/);
  });
});

describe("ACE-Step on fal", () => {
  it("sends lyrics, style and vocal language, and keeps the audio format", async () => {
    const calls: { url: string; body?: string }[] = [];
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string | undefined });
      if (url === "https://queue.fal.run/fal-ai/ace-step-1.5") return Response.json({ request_id: "r", status_url: "s", response_url: "o" });
      if (url === "s") return Response.json({ status: "COMPLETED" });
      if (url === "o") return Response.json({ audio: { url: "https://cdn.test/out/song.mp3", content_type: "audio/mpeg" } });
      return new Response(Buffer.from("mp3-bytes"));
    }) as unknown as typeof fetch;
    const singer = new FalAceStep(new FalQueueClient("k", fetchFn, 0), undefined, fetchFn);

    const audio = await singer.sing({ style: "pop", lyrics: "[Verse]\nhi", durationSec: 60, vocalLanguage: "hi" });

    expect(JSON.parse(calls[0].body!)).toEqual({ prompt: "pop", lyrics: "[Verse]\nhi", duration: 60, vocal_language: "hi" });
    expect(audio.ext).toBe("mp3");
    expect(audio.data.toString()).toBe("mp3-bytes");
  });
});

describe("songs and credits", () => {
  let db: Db;
  beforeAll(async () => {
    db = await testDb();
    const now = new Date();
    await db.insert(user).values([{ id: "u1", name: "One", email: "one@example.com", createdAt: now, updatedAt: now }]);
  }, 30_000);

  it("charges, tracks and refunds a song", async () => {
    await grantCredits(db, "u1", 5, "grant", "welcome");
    expect(await spendCredits(db, "u1", 4, "song:s1", "song")).toBe(true);
    const song = await createSong(db, { userId: "u1", title: "T", genre: "pop", language: "en", lyrics: "[Verse]\nla la la la la la", durationSec: 60, credits: 4 });
    expect(songView(song).audioUrl).toBeNull();
    await updateSong(db, song.id, { status: "completed", outputPath: "/srv/songs/x.mp3" });
    expect(songView((await getSong(db, "u1", song.id))!).audioUrl).toBe(`/api/songs/${song.id}/audio`);
    expect(await getSong(db, "u2", song.id)).toBeUndefined();
    expect(await listSongs(db, "u1")).toHaveLength(1);

    expect(await grantCredits(db, "u1", 4, "refund", "song:s1")).toBe(true);
    expect(await grantCredits(db, "u1", 4, "refund", "song:s1")).toBe(false);
    expect(await getBalance(db, "u1")).toBe(5);
    expect((await recentLedger(db, "u1")).map((l) => l.reason)).toContain("song");
  });
});
