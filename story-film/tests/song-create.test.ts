import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FalQueueClient } from "@/lib/providers/fal";
import { FalAceStep, lyriaPrompt } from "@/lib/providers/fal-music";
import type { ImageProvider, LlmProvider } from "@/lib/providers/types";
import { aceInputs, experimentInputs, strictnessInputs } from "@/lib/songs/controls";
import { coverPrompt, makeCover } from "@/lib/songs/cover";
import { ideaTitle, prepareSong, songControls } from "@/lib/songs/create";
import { buildLyricsPrompt } from "@/lib/songs/lyrics";
import { buildRapPrompt, writeRap } from "@/lib/songs/rap-verse";
import { newSongSchema } from "@/lib/songs/request";
import { songView } from "@/lib/songs/songs";
import { addSection, blocksOf, insertRap, moveSection, onlyTags, parseTag, removeSection, setSinger, structureOf } from "@/lib/songs/structure";
import { findGenre } from "@/lib/songs/styles";

const genre = findGenre("desi-hip-hop")!;

function llm(replies: Record<string, unknown>): LlmProvider & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    modelId: "test",
    prompts,
    writeScript: async () => {
      throw new Error("unused");
    },
    // Replies by the first matching word in the prompt.
    completeJson: async (p: string) => {
      prompts.push(p);
      const key = Object.keys(replies).find((k) => p.includes(k));
      if (!key) throw new Error(`no reply for: ${p.slice(0, 60)}`);
      return replies[key];
    },
  };
}

describe("song structure blocks", () => {
  const song = "intro line\n[Verse]\nsubah ki chai\n\n[Chorus]\nye pal hai mera\n\n[Verse 2 - female vocal]\nshaam ki baarish";

  it("reads blocks from the lyrics tags, with singers", () => {
    expect(blocksOf(song)).toEqual([
      { kind: "Verse", singer: null, empty: false },
      { kind: "Chorus", singer: null, empty: false },
      { kind: "Verse", singer: "female", empty: false },
    ]);
    expect(parseTag("[Chorus - male and female vocals together]")).toEqual({ kind: "Chorus", singer: "both" });
    expect(parseTag("[Pre-chorus]")?.kind).toBe("Pre-Chorus");
    expect(parseTag("[Instrumental]")).toBeNull();
  });

  it("adds, moves and removes blocks, carrying their words along", () => {
    const added = addSection(song, "Chorus");
    // A repeated chorus sings the same words.
    expect(added.endsWith("[Chorus]\nye pal hai mera")).toBe(true);
    const moved = moveSection(song, 0, 1);
    expect(moved).toBe("intro line\n\n[Chorus]\nye pal hai mera\n\n[Verse]\nsubah ki chai\n\n[Verse - female vocal]\nshaam ki baarish");
    // Moving back undoes it; moving past either end changes nothing.
    expect(moveSection(moved, 1, -1)).toBe(moveSection(song, 0, -1));
    expect(structureOf(moveSection(song, 2, 1))).toEqual(["Verse", "Chorus", "Verse"]);
    expect(structureOf(removeSection(song, 1))).toEqual(["Verse", "Verse"]);
    expect(setSinger(song, 1, "both")).toContain("[Chorus - male and female vocals together]\nye pal hai mera");
  });

  it("starts from empty blocks and knows when there are no words yet", () => {
    const tags = addSection(addSection("", "Intro"), "Rap");
    expect(tags).toBe("[Intro]\n\n[Rap]");
    expect(onlyTags(tags)).toBe(true);
    expect(onlyTags(song)).toBe(false);
  });

  it("puts rap bars in an empty [Rap] block, else after the first chorus", () => {
    expect(insertRap("[Verse]\na\n\n[Rap]\n\n[Chorus]\nc", "bar one\nbar two")).toBe("[Verse]\na\n\n[Rap]\nbar one\nbar two\n\n[Chorus]\nc");
    expect(structureOf(insertRap(song, "bars"))).toEqual(["Verse", "Chorus", "Rap", "Verse"]);
    expect(structureOf(insertRap("[Verse]\na", "bars"))).toEqual(["Verse", "Rap"]);
  });

  it("is the same file on the iPhone", () => {
    expect(readFileSync("mobile/src/lib/song-structure.ts", "utf8")).toBe(readFileSync("src/lib/songs/structure.ts", "utf8"));
  });
});

describe("Experiment and Follow my style", () => {
  it("maps to ACE-Step 1.5 inputs fal has, landing on fal's defaults in the middle", () => {
    expect(experimentInputs(50)).toEqual({ lmTemperature: 0.85, inferMethod: "ode" });
    expect(experimentInputs(0)).toEqual({ lmTemperature: 0.55, inferMethod: "ode" });
    expect(experimentInputs(100)).toEqual({ lmTemperature: 1.25, inferMethod: "sde" });
    expect(strictnessInputs(0)).toEqual({ lmCfgScale: 1 });
    expect(strictnessInputs(100)).toEqual({ lmCfgScale: 2.5 });
  });

  it("sends only the dials that are set, and never guidance_scale (turbo ignores it)", () => {
    expect(aceInputs({ lmTemperature: 0.9, inferMethod: "sde", lmCfgScale: 1, bpm: 96, keyScale: "A minor" })).toEqual({ lm_temperature: 0.9, infer_method: "sde", bpm: 96, key_scale: "A minor" });
    expect(aceInputs({ lmCfgScale: 1.75 })).toEqual({ lm_cfg_scale: 1.75 });
    expect(aceInputs(undefined)).toEqual({});
  });

  it("keeps Simple mode on fal's defaults and Lyria to BPM and key", () => {
    const base = { experiment: 100, strictness: 100, bpm: 96, keyScale: "C major" };
    expect(songControls({ ...base, model: "ace-step", mode: "simple" })).toEqual({ bpm: 96, keyScale: "C major" });
    expect(songControls({ ...base, model: "lyria", mode: "custom" })).toEqual({ bpm: 96, keyScale: "C major" });
    expect(songControls({ ...base, model: "ace-step", mode: "custom" })).toMatchObject({ lmTemperature: 1.25, inferMethod: "sde", lmCfgScale: 2.5 });
  });

  it("reach fal's ACE-Step call", async () => {
    let body = "";
    const fetchFn = (async (url: string, init?: RequestInit) => {
      if (url === "https://queue.fal.run/fal-ai/ace-step-1.5") {
        body = init?.body as string;
        return Response.json({ request_id: "r", status_url: "s", response_url: "o" });
      }
      if (url === "s") return Response.json({ status: "COMPLETED" });
      if (url === "o") return Response.json({ audio: { url: "https://cdn.test/a.mp3", content_type: "audio/mpeg" } });
      return new Response(Buffer.from("ID3x"));
    }) as unknown as typeof fetch;
    await new FalAceStep(new FalQueueClient("k", fetchFn, 0), undefined, fetchFn).sing({ style: "pop", lyrics: "[Verse]\nhi", durationSec: 30, vocalLanguage: "hi", controls: { bpm: 120, lmTemperature: 1.1 } });
    expect(JSON.parse(body)).toEqual({ prompt: "pop", lyrics: "[Verse]\nhi", duration: 30, vocal_language: "hi", lm_temperature: 1.1, bpm: 120 });
  });

  it("tells Lyria the tempo and key in words, and when there are no vocals", () => {
    const song = { style: "lofi", lyrics: "[Instrumental]", durationSec: 30, vocalLanguage: "hi", controls: { bpm: 80, keyScale: "D minor" } };
    expect(lyriaPrompt(song)).toBe("lofi, 80 bpm, in D minor. Instrumental only, no vocals.");
  });
});

describe("Simple, Custom and Instrumental", () => {
  it("needs a sentence in Simple, words in Custom", () => {
    expect(newSongSchema.safeParse({ genre: "pop", mode: "simple", topic: "chai on a rainy day" }).success).toBe(true);
    expect(newSongSchema.safeParse({ genre: "pop", mode: "simple" }).success).toBe(false);
    expect(newSongSchema.safeParse({ genre: "pop", mode: "custom", topic: "chai" }).success).toBe(false);
    // Older apps send no mode: Custom, as before.
    expect(newSongSchema.parse({ genre: "pop", title: "T", lyrics: "[Verse]\nla la la la la la la" }).mode).toBe("custom");
    expect(newSongSchema.safeParse({ genre: "pop", mode: "instrumental", topic: "rain", keyScale: "H major" }).success).toBe(false);
    expect(newSongSchema.safeParse({ genre: "pop", mode: "instrumental", topic: "rain", bpm: 300 }).success).toBe(false);
  });

  it("Simple mode has AI write the title, lyrics and style in the chosen blocks", async () => {
    const ai = llm({ songwriter: { title: "Chai Ke Saath", lyrics: "[Verse]\nsubah ki chai\n[Rap]\nbars bars" }, "style descriptions": { style: "desi hip hop, 96 bpm, tabla" } });
    const req = newSongSchema.parse({ genre: "desi-hip-hop", mode: "simple", topic: "chai with friends", structure: ["Verse", "Rap"], vocal: "duet", language: "hinglish" });
    const out = await prepareSong(ai, req, genre);
    expect(out.title).toBe("Chai Ke Saath");
    expect(out.lyrics).toContain("[Rap]");
    expect(out.style).toBe("desi hip hop, 96 bpm, tabla, male and female duet vocals");
    expect(out.controls).toEqual({ bpm: undefined, keyScale: undefined });
    const lyricsPrompt = ai.prompts.find((p) => p.includes("songwriter"))!;
    expect(lyricsPrompt).toContain("[Verse] [Rap]");
    expect(lyricsPrompt).toContain("[Verse - male vocal]");
  });

  it("Instrumental mode sends no lyrics and asks for no vocals", async () => {
    const req = newSongSchema.parse({ genre: "khaleeji", mode: "instrumental", topic: "desert night drive." });
    const out = await prepareSong(llm({}), req, findGenre("khaleeji")!);
    expect(out).toMatchObject({ title: "Desert night drive", lyrics: "[Instrumental]" });
    expect(out.style).toMatch(/oud.*, instrumental, no vocals$/);
    expect(ideaTitle("", genre)).toBe("Desi hip-hop instrumental");
  });

  it("Custom mode keeps the creator's words and turns the dials into inputs", async () => {
    const req = newSongSchema.parse({ genre: "desi-hip-hop", title: "Mine", lyrics: "(chorus)\nmeri galli mera sheher", experiment: 0, strictness: 100 });
    const out = await prepareSong(llm({}), req, genre);
    expect(out).toMatchObject({ title: "Mine", lyrics: "[Chorus]\nmeri galli mera sheher", controls: { lmTemperature: 0.55, lmCfgScale: 2.5 } });
  });

  it("the lyrics prompt follows the blocks", () => {
    const p = buildLyricsPrompt({ topic: "t", genre, mood: "", language: "hi", durationSec: 60, structure: ["Intro", "Verse", "Drop"] });
    expect(p).toContain("[Intro] [Verse] [Drop]");
    expect(buildLyricsPrompt({ topic: "t", genre, mood: "", language: "hi", durationSec: 60 })).toContain("optionally [Bridge]");
  });
});

describe("✨ Write a rap verse", () => {
  it("writes bars in the song's language, about the song, without tags", async () => {
    const ai = llm({ rapper: { bars: "[Rap]\nSubah ki chai, haath mein phone\nSapne bade, raaste anjaan\nthree\nfour\nfive\nsix\nseven\neight\nnine" } });
    const req = { topic: "dreams", genre, mood: "energetic", language: "hinglish" as const, lyrics: "[Chorus]\nUdne de mujhe", bars: 8 as const };
    const bars = await writeRap(ai, req);
    expect(bars.split("\n")).toHaveLength(8);
    expect(bars.startsWith("Subah ki chai")).toBe(true);
    const prompt = buildRapPrompt(req);
    expect(prompt).toContain("Hinglish");
    expect(prompt).toContain("Udne de mujhe");
    expect(prompt).toContain("Exactly 8 bars");
  });
});

describe("AI cover art", () => {
  const s = { title: "Chai Ke Saath", genre: "lofi-hindi", mood: "peaceful", lyrics: "[Verse]\nBaarish ki boondein\nKhidki pe gaana" };

  it("describes a square picture from the song, with no text or real people", () => {
    const p = coverPrompt(s);
    expect(p).not.toContain("Chai Ke Saath");
    expect(p).toContain("Lo-fi Hindi");
    expect(p).toContain("Baarish ki boondein / Khidki pe gaana");
    expect(p).toContain("no text");
  });

  it("crops the picture square into the song's folder", async () => {
    const calls: string[][] = [];
    const image: ImageProvider = { modelId: "x", generateKeyframe: async () => ({ url: "https://img.test/a.jpg" }) };
    const out = await makeCover({ image, ffmpeg: async (a) => void calls.push(a) }, s, "/out/s-cover.jpg");
    expect(out).toBe("/out/s-cover.jpg");
    expect(calls[0]).toEqual(["-y", "-i", "https://img.test/a.jpg", "-vf", "crop='min(iw,ih)':'min(iw,ih)',scale=768:768", "-frames:v", "1", "-q:v", "3", "/out/s-cover.jpg"]);
  });

  it("is on the Song API object once made", () => {
    const row = { id: "id1", title: "t", genre: "pop", mood: "", language: "hi", lyrics: "", durationSec: 30, status: "completed", voiceProfileId: null, parentSongId: null, contentCredentials: false, error: null, createdAt: new Date(), outputPath: "/a.mp3" };
    expect(songView({ ...row, coverPath: "/c.jpg" } as never).coverUrl).toBe("/api/songs/id1/cover");
    expect(songView({ ...row, coverPath: null } as never).coverUrl).toBeNull();
  });
});
