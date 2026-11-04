import { beforeAll, describe, expect, it } from "vitest";
import { getBalance, grantCredits, recentLedger, spendCredits } from "@/lib/billing/credits";
import type { Db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { FalQueueClient } from "@/lib/providers/fal";
import { FalAceStep, FalLyria, lyriaPrompt } from "@/lib/providers/fal-music";
import type { LlmProvider } from "@/lib/providers/types";
import { buildEnhancePrompt, draftLanguage, buildLyricsPrompt, cleanLyrics, enhanceLyrics, missingLines, targetLines, writeLyrics } from "@/lib/songs/lyrics";
import { editedLength, isNoop, songEditArgs, songEditSchema } from "@/lib/songs/edit";
import { lyricsRequestSchema, newSongSchema, songLength } from "@/lib/songs/request";
import { buildStylePrompt, writeStyle } from "@/lib/songs/style-writer";
import { assertNoRealArtists, findBlockedArtist, SongSafetyError } from "@/lib/songs/safety";
import { createSong, getSong, listSongs, songView, takeCredits, updateSong } from "@/lib/songs/songs";
import { findGenre, stylePrompt } from "@/lib/songs/styles";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { defaultFfmpeg, probeDuration } from "@/lib/ffmpeg";
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

describe("short songs with Lyria on fal", () => {
  it("puts the lyrics and language in the prompt, and keeps the mp3", async () => {
    const calls: { url: string; body?: string }[] = [];
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string | undefined });
      if (url === "https://queue.fal.run/fal-ai/lyria3") return Response.json({ request_id: "r", status_url: "s", response_url: "o" });
      if (url === "s") return Response.json({ status: "COMPLETED" });
      if (url === "o") return Response.json({ audio: { url: "https://cdn.test/out/a.mp3", content_type: "audio/mpeg" }, lyrics: "Caption: …" });
      return new Response(Buffer.from("mp3-bytes"));
    }) as unknown as typeof fetch;
    const song = { style: "Bollywood ballad, soft female vocals", lyrics: "[Chorus]\nपापा की दुनिया", durationSec: 30, vocalLanguage: "hi" };

    const audio = await new FalLyria(new FalQueueClient("k", fetchFn, 0), fetchFn).sing(song);

    expect(JSON.parse(calls[0].body!)).toEqual({ prompt: lyriaPrompt(song) });
    expect(lyriaPrompt(song)).toBe("Bollywood ballad, soft female vocals. A song sung in Hindi, with exactly these lyrics in this order (section tags in brackets are not sung):\n[Chorus]\nपापा की दुनिया");
    expect(lyriaPrompt({ ...song, vocalLanguage: "unknown" })).toMatch(/^Bollywood ballad, soft female vocals\. A song, with exactly/);
    expect(audio).toEqual({ data: Buffer.from("mp3-bytes"), ext: "mp3" });
  });

  it("makes full songs unless a short song is asked for, which is always 30 seconds", () => {
    expect(newSongSchema.parse({ genre: "pop", title: "T", lyrics: "[Verse]\nla la la la la la la" }).model).toBe("ace-step");
    expect(songLength("ace-step", 120)).toBe(120);
    expect(songLength("lyria", 120)).toBe(30);
    expect(newSongSchema.safeParse({ genre: "pop", title: "T", lyrics: "[Verse]\nla la la la la la la", model: "minimax" }).success).toBe(false);
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

describe("enhance my lyrics", () => {
  const genre = findGenre("bollywood-romantic")!;
  const draft = "पापा की दुनिया में मैं ही रानी\nहर दिन लगे जैसे नई कहानी";
  const req = { topic: "", genre, mood: "romantic", language: "hi" as const, durationSec: 60 };

  it("asks to keep the creator's lines word for word", () => {
    const prompt = buildEnhancePrompt(draft, req);
    expect(prompt).toContain(draft);
    expect(prompt).toContain("exactly as written");
    expect(prompt).toContain("Devanagari");
    expect(prompt).not.toContain("Topic:");
  });

  it("keeps the script the creator wrote in", () => {
    expect(draftLanguage("Papa ki duniya mein main hi rani", "hi")).toBe("hinglish");
    expect(draftLanguage(draft, "hinglish")).toBe("hi");
    expect(draftLanguage(draft, "hi")).toBe("hi");
    expect(draftLanguage("My papa's world", "en")).toBe("en");
    expect(buildEnhancePrompt("Papa ki duniya mein main hi rani", req)).toContain("Hinglish");
  });

  it("finds dropped lines, ignoring spacing and punctuation", () => {
    expect(missingLines(draft, "[Verse]\nपापा की दुनिया में, मैं ही रानी!\nकुछ और")).toEqual(["हर दिन लगे जैसे नई कहानी"]);
    expect(missingLines("[Chorus]\nhello world", "[Verse]\nHello world")).toEqual([]);
  });

  it("tries again once when the AI drops a line", async () => {
    const replies = [
      { title: "Papa", lyrics: "[Verse]\nपापा की दुनिया में मैं ही रानी\nबदली हुई लाइन" },
      { title: "Papa Ki Duniya", lyrics: `[Verse]\n${draft}\n[Chorus]\nपापा की दुनिया, प्यारी सी दुनिया` },
    ];
    const llm = llmReplying(() => replies.shift());
    const out = await enhanceLyrics(llm, draft, req);
    expect(llm.prompts).toHaveLength(2);
    expect(llm.prompts[1]).toContain("dropped or changed");
    expect(out.title).toBe("Papa Ki Duniya");
    expect(missingLines(draft, out.lyrics)).toEqual([]);
  });

  it("accepts a topic or a draft, but not neither", () => {
    expect(lyricsRequestSchema.safeParse({ genre: "pop", draft }).success).toBe(true);
    expect(lyricsRequestSchema.safeParse({ genre: "pop", topic: "rain" }).success).toBe(true);
    expect(lyricsRequestSchema.safeParse({ genre: "pop", topic: "", draft: "hi" }).success).toBe(false);
  });
});

describe("song style", () => {
  const genre = findGenre("bollywood-romantic")!;

  it("uses the creator's style text over the preset, and adds the voice", () => {
    expect(stylePrompt(genre, "sad", "female")).toBe(`${genre.prompt}, sad mood, female lead vocals`);
    expect(stylePrompt(genre, "sad", "duet", "lo-fi, piano, 70 bpm")).toBe("lo-fi, piano, 70 bpm, male and female duet vocals");
    expect(stylePrompt(genre, "", "auto", "  ")).toBe(genre.prompt);
    expect(stylePrompt(genre, "", "female", "ballad, soft female vocals")).toBe("ballad, soft female vocals");
    expect(stylePrompt(genre, "", "male", "ballad, soft female vocals")).toBe("ballad, soft female vocals, male lead vocals");
  });

  it("writes a detailed style without artists, tidied and capped", async () => {
    const req = { idea: "sad papa beti song", genre, mood: "sad", vocal: "female" as const, language: "hinglish" as const };
    const prompt = buildStylePrompt(req);
    expect(prompt).toContain("sad papa beti song");
    expect(prompt).toContain("female lead");
    expect(prompt).toContain("never name real singers");
    const style = await writeStyle(llmReplying({ style: "  emotional Bollywood ballad,  soft piano, 72 bpm, " + "x".repeat(400) }), req);
    expect(style.startsWith("emotional Bollywood ballad, soft piano, 72 bpm,")).toBe(true);
    expect(style.length).toBe(300);
  });

  it("makes two takes by default and splits the price between them", () => {
    const song = newSongSchema.parse({ genre: "pop", title: "T", lyrics: "[Verse]\nla la la la la la la" });
    expect(song).toMatchObject({ takes: 2, vocal: "auto", topic: "" });
    expect(takeCredits(4, 2)).toEqual([2, 2]);
    expect(takeCredits(5, 2)).toEqual([3, 2]);
    expect(takeCredits(4, 1)).toEqual([4]);
  });
});

describe("crop, fade and speed", () => {
  const edit = (e: object) => songEditSchema.parse(e);

  it("builds ffmpeg arguments and the new length", () => {
    const e = edit({ startSec: 10, endSec: 40, fadeInSec: 2, fadeOutSec: 3, speed: 1.25 });
    expect(editedLength(e, 60)).toBe(24);
    expect(songEditArgs("in.mp3", "out.mp3", e, 60)).toEqual([
      "-y", "-ss", "10", "-t", "30", "-i", "in.mp3",
      "-af", "atempo=1.25,afade=t=in:st=0:d=2,afade=t=out:st=21:d=3",
      "-c:a", "libmp3lame", "-q:a", "2", "out.mp3",
    ]);
  });

  it("rejects empty and impossible edits", () => {
    expect(isNoop(edit({}), 60)).toBe(true);
    expect(isNoop(edit({ endSec: 80 }), 60)).toBe(true);
    expect(isNoop(edit({ fadeOutSec: 2 }), 60)).toBe(false);
    expect(() => editedLength(edit({ startSec: 59.5 }), 60)).toThrow(/at least one second/);
    expect(songEditSchema.safeParse({ startSec: 10, endSec: 5 }).success).toBe(false);
    expect(songEditSchema.safeParse({ speed: 3 }).success).toBe(false);
  });

  it("really crops, speeds up and fades a song", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "song-edit-"));
    try {
      const input = path.join(dir, "in.mp3");
      await defaultFfmpeg(["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=20", "-c:a", "libmp3lame", input]);
      const e = edit({ startSec: 2, endSec: 14, fadeOutSec: 2, speed: 1.2 });
      await defaultFfmpeg(songEditArgs(input, path.join(dir, "out.mp3"), e, await probeDuration(input)));
      expect(await probeDuration(path.join(dir, "out.mp3"))).toBeCloseTo(10, 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
