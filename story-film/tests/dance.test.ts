import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { dholBeat, SAMPLE_RATE } from "@/lib/dance/beat";
import { encodeWav } from "@/lib/dance/beat";
import { chantWordAt, poseFor } from "@/lib/dance/draw";
import { attachWords, danceFfmpegArgs, danceLyrics, type DanceRenderInput, runDanceReel, songSegments, voicePlacements } from "@/lib/dance/pipeline";
import { beatSec, DANCE_MOVES, type DanceScript, danceScriptSchema, planDance } from "@/lib/dance/script";
import { planMelody, SING_LEAD, SING_RATE, singLine, splitPieces, syllables, trackPitch } from "@/lib/dance/sing";
import { ACTIONS } from "@/lib/agent/actions";
import { runAction } from "@/lib/agent/agent";
import { DANCE_SONG_CREDITS, PREMIUM_CREDITS_PER_SHOT } from "@/lib/billing/catalog";
import { user } from "@/lib/db/schema";
import type { SongInput } from "@/lib/providers/fal-music";
import type { LlmProvider, TtsProvider } from "@/lib/providers/types";
import { paidCredits, parseFilmRequest } from "@/lib/start-film";
import { testDb } from "./helpers/db";

const dir = mkdtempSync(path.join(tmpdir(), "dance-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const script: DanceScript = danceScriptSchema.parse({
  title: "Dubi Dubi Dum Dum",
  language: "hi",
  bpm: 120,
  scene: "courtyard",
  dancers: [
    { name: "Aarav", skin: "medium", outfit: "kurta", color: "#ffb21a", hair: "curly" },
    { name: "Meera", skin: "light", outfit: "lehenga", color: "#e0198a", hair: "ponytails" },
  ],
  lines: [
    { text: "डुबी डुबी डम डम", move: "clap" },
    { text: "गोल गोल घूमो", move: "spin" },
    { text: "हाथ ऊपर करो", move: "jump" },
  ],
});

describe("dance script", () => {
  it("falls back to safe values instead of rejecting a slightly-off script", () => {
    const s = danceScriptSchema.parse({ ...script, bpm: 300, scene: "moon", dancers: [{ name: "Ria", skin: "green", outfit: "cape", color: "red", hair: "mohawk" }], lines: [{ text: "Chak chak", move: "moonwalk" }] });
    expect(s).toMatchObject({ bpm: 118, scene: "courtyard", dancers: [{ skin: "medium", outfit: "kurta", color: "#ffb21a", hair: "short" }], lines: [{ move: "bounce" }] });
    expect(danceScriptSchema.safeParse({ ...script, dancers: [] }).success).toBe(false);
  });

  it("lays the chant on the beat, repeats it like a chorus and fills the reel exactly", () => {
    const bar = beatSec(120) * 4;
    const segs = planDance(script, [1.1, 1.4, 2.3], 30);
    expect(segs[0]).toMatchObject({ line: -1, start: 0, end: bar });
    expect(segs.at(-1)).toMatchObject({ line: -2, move: "jump", end: 30 });
    expect(segs.at(-1)!.end - segs.at(-1)!.start).toBeGreaterThanOrEqual(bar - 1e-9);
    for (let i = 1; i < segs.length; i++) expect(segs[i].start).toBeCloseTo(segs[i - 1].end, 9);
    // Every line starts on a half-bar and lasts long enough for its voice.
    const lines = segs.filter((s) => s.line >= 0);
    for (const s of lines) {
      expect((s.start / (bar / 2)) % 1).toBeCloseTo(0, 6);
      expect(s.end - s.start).toBeGreaterThan([1.1, 1.4, 2.3][s.line]);
    }
    expect(lines.slice(0, 4).map((s) => s.line)).toEqual([0, 1, 2, 0]);
  });

  it("still sings a first line that is too long for a short reel", () => {
    const segs = planDance(script, [20], 15);
    expect(segs.map((s) => s.line)).toEqual([-1, 0, -2]);
    expect(segs.at(-1)!.end).toBe(15);
  });

  it("moves every dancer on the beat", () => {
    for (const move of DANCE_MOVES) {
      const pose = poseFor(move, 3.25);
      expect(pose.arm.every(Number.isFinite)).toBe(true);
      expect(Number.isFinite(pose.lift)).toBe(true);
    }
    // A jump is in the air between beats 0 and 1, and claps close on the beat.
    expect(poseFor("jump", 0.5).lift).toBeGreaterThan(80);
    expect(poseFor("jump", 0).lift).toBeCloseTo(0, 6);
    expect(poseFor("clap", 2).clap).toBe(1);
    expect(poseFor("clap", 2.5).clap).toBe(0);
  });
});

describe("dhol beat", () => {
  it("is a mono 16-bit WAV of the right length, loud but never clipping", () => {
    const wav = dholBeat(120, 4);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt32LE(24)).toBe(SAMPLE_RATE);
    const samples = (wav.length - 44) / 2;
    expect(samples).toBe(4 * SAMPLE_RATE);
    let peak = 0;
    for (let i = 0; i < samples; i++) peak = Math.max(peak, Math.abs(wav.readInt16LE(44 + i * 2)));
    expect(peak).toBeGreaterThan(16000);
    expect(peak).toBeLessThan(32767);
    // The first hit is the downbeat.
    let early = 0;
    for (let i = 0; i < SAMPLE_RATE * 0.05; i++) early = Math.max(early, Math.abs(wav.readInt16LE(44 + i * 2)));
    expect(early).toBeGreaterThan(8000);
  });
});

describe("dance audio mix", () => {
  it("places each chant line on its segment, and the hook again in the finale when it fits", () => {
    const segs = planDance(script, [1.1, 1.4, 1.2], 15);
    const placed = voicePlacements(segs, [1.1, 1.4, 1.2]);
    expect(placed.at(-1)).toEqual({ line: 0, at: segs.at(-1)!.start });
    const args = danceFfmpegArgs({ segments: segs, spoken: [1.1, 1.4, 1.2], voices: ["a.wav", "b.wav", "c.wav"], beat: "beat.wav", output: "out.mp4" }, 1080, 1920);
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph.match(/adelay=/g)).toHaveLength(placed.length);
    expect(graph).toContain(`adelay=${Math.round(segs[1].start * 1000)}|`);
    expect(args.filter((a) => a === "-i")).toHaveLength(2 + placed.length);
    expect(args[args.indexOf("-t") + 1]).toBe("15.00");
  });
});

describe("runDanceReel", () => {
  const tone = path.join(dir, "tone.wav");
  const tts = { modelId: "kokoro-82m", speak: async () => readFileSync(tone) } as unknown as TtsProvider;

  it.skipIf(!hasFfmpeg)("uses the assistant's script as written and renders a 9:16 video with sound", async () => {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=330:duration=1", tone]);
    const llm = { modelId: "llama-3.3-70b", completeJson: async () => { throw new Error("should not write a script"); } } as unknown as LlmProvider;
    const stages: string[] = [];
    const { output, title } = await runDanceReel(
      { llm, tts, fontsDir: path.resolve("assets/fonts") },
      { story: "x".repeat(30), durationSec: 4, watermark: true, danceScript: script },
      path.join(dir, "job"),
      (s) => void stages.push(s),
    );
    expect(title).toBe("Dubi Dubi Dum Dum");
    expect(stages).toEqual(["script", "audio", "assemble", "done"]);
    const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", output]).toString();
    const info = JSON.parse(probe) as { streams: { codec_type: string; width?: number; height?: number }[]; format: { duration: string } };
    expect(info.streams.find((s) => s.codec_type === "video")).toMatchObject({ width: 1080, height: 1920 });
    expect(info.streams.some((s) => s.codec_type === "audio")).toBe(true);
    expect(Number(info.format.duration)).toBeCloseTo(4, 0);
  }, 120_000);

  it("writes a script with the LLM when none is given, and plans from the voice lengths", async () => {
    const prompts: string[] = [];
    const llm = { modelId: "llama-3.3-70b", completeJson: async (p: string) => (prompts.push(p), script) } as unknown as LlmProvider;
    let rendered: DanceRenderInput | undefined;
    const silent = { modelId: "kokoro-82m", speak: async () => Buffer.from("RIFF") } as unknown as TtsProvider;
    await runDanceReel(
      { llm, tts: silent, fontsDir: "unused", probeDuration: async () => 1.5, render: async (input) => void (rendered = input) },
      { story: "A rain dance for toddlers", durationSec: 15, watermark: false, language: "hi", voice: "chant" },
      path.join(dir, "job2"),
    );
    expect(prompts[0]).toContain("A rain dance for toddlers");
    expect(prompts[0]).toMatch(/Never copy lyrics/);
    expect(rendered!.segments.at(-1)!.end).toBe(15);
    expect(rendered!.voices).toHaveLength(3);
    expect(rendered!.spoken).toEqual([1.5, 1.5, 1.5]);
  });
});

// A voice-like test signal: each "syllable" a buzzy vowel at a gliding pitch, with short gaps between them,
// so the singer has words to cut, pitch to flatten and silences to find.
function fakeSpeech(syllableCount: number, gapAfter: number[] = []): Float32Array {
  const syl = Math.round(SING_RATE * 0.22);
  const gap = Math.round(SING_RATE * 0.06);
  const x = new Float32Array(gap + syllableCount * (syl + gap));
  let at = gap;
  let phase = 0;
  for (let k = 0; k < syllableCount; k++) {
    for (let i = 0; i < syl; i++) {
      const hz = 190 + 40 * Math.sin((k + i / syl) * 2.1);
      phase += (2 * Math.PI * hz) / SING_RATE;
      const env = Math.sin((Math.PI * i) / syl);
      x[at + i] = 0.5 * env * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.3 * Math.sin(3 * phase));
    }
    at += syl + (gapAfter.includes(k) ? gap * 2 : gap);
    if (at + syl > x.length) break;
  }
  return x;
}

const midiAt = (pcm: Float32Array, from: number, to: number) => {
  const tr = trackPitch(pcm);
  const hz = [...tr.periods.slice(Math.floor(from * 100), Math.floor(to * 100))].filter((p) => p > 0).map((p) => SING_RATE / p).sort((a, b) => a - b);
  return hz.length ? 69 + 12 * Math.log2(hz[hz.length >> 1] / 440) : NaN;
};

describe("sung melody", () => {
  it("counts syllables in Latin script and Hindi", () => {
    expect([syllables("dubi"), syllables("dum"), syllables("chalo")]).toEqual([2, 1, 2]);
    expect([syllables("डुबी"), syllables("डम"), syllables("ऊपर"), syllables("नाचो")]).toEqual([2, 1, 2, 2]);
  });

  it("puts every note on the eighth-note grid in the major pentatonic, ending lines open or home", () => {
    const eighth = beatSec(120) / 2;
    const tonic = 57;
    for (let line = 0; line < 3; line++) {
      const m = planMelody(script.lines[line].text, 120, line, 3, tonic);
      for (const n of m.notes) {
        expect((n.start / eighth) % 1).toBeCloseTo(0, 9);
        expect([0, 2, 4, 7, 9]).toContain((n.midi - tonic) % 12);
        expect(n.end).toBeGreaterThan(n.start);
      }
      expect((m.durationSec / eighth) % 1).toBeCloseTo(0, 9);
      expect(m.notes.at(-1)!.end).toBeCloseTo(m.durationSec, 9);
      // The last note is held: twice the length of the others.
      expect(m.notes.at(-1)!.end - m.notes.at(-1)!.start).toBeCloseTo(2 * (m.notes[0].end - m.notes[0].start), 9);
      // "Call" lines end on sol, the last line comes home to do.
      expect(m.notes.at(-1)!.midi - tonic).toBe(line === 2 || line % 2 === 1 ? 0 : 7);
    }
    // डुबी डुबी डम डम: two notes for each डुबी, one for each डम, a quarter beat each; words follow their notes.
    const hook = planMelody("डुबी डुबी डम डम", 120, 0, 3, tonic);
    expect(hook.notes.map((n) => n.word)).toEqual([0, 0, 1, 1, 2, 3]);
    expect(hook.words.map((w) => w.start / eighth)).toEqual([0, 4, 8, 10]);
    expect(hook.words.at(-1)!.end).toBeCloseTo(hook.durationSec, 9);
    expect(planMelody("डुबी डुबी डम डम", 120, 0, 3, tonic)).toEqual(hook);
  });

  it("cuts the voice into words at the quiet gaps", () => {
    const x = fakeSpeech(4);
    const pieces = splitPieces(x, [1, 1, 1, 1]);
    expect(pieces).toHaveLength(4);
    const per = (0.22 + 0.06) * SING_RATE;
    pieces.slice(1).forEach(([start], k) => {
      // Each cut lands in the gap before syllable k+1, give or take a frame.
      const gapStart = 0.06 * SING_RATE + (k + 1) * per - 0.06 * SING_RATE;
      expect(start).toBeGreaterThanOrEqual(gapStart - 0.015 * SING_RATE);
      expect(start).toBeLessThanOrEqual(gapStart + 0.075 * SING_RATE);
    });
  });

  it("sings each piece at its note's pitch, the same every time", () => {
    const x = fakeSpeech(5);
    const melody = planMelody("dubi dubi dum", 120, 0, 3, 52);
    const a = singLine(x, melody);
    expect(singLine(x, melody)).toEqual(a);
    expect(a.length).toBeGreaterThanOrEqual(Math.round((SING_LEAD + melody.durationSec) * SING_RATE));
    for (const n of melody.notes) {
      const mid = midiAt(a, SING_LEAD + n.start + 0.06, SING_LEAD + n.end - 0.06);
      expect(Math.abs(mid - n.midi)).toBeLessThan(0.6);
    }
    let peak = 0;
    for (const v of a) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeCloseTo(0.9, 2);
  });
});

describe("sung captions", () => {
  it("highlights the word being sung from its timing, and gives the finale the hook's words", () => {
    const words = [{ start: 0, end: 0.5 }, { start: 0.5, end: 1 }, { start: 1, end: 2 }];
    expect([0, 0.49, 0.5, 1.2, 5].map((t) => chantWordAt(["a", "b", "c"], t, 2, words))).toEqual([0, 0, 1, 2, 2]);
    // Without timings (spoken chant) it still shares the time out by word length.
    expect(chantWordAt(["a", "b"], 0.1, 1)).toBe(0);

    const spoken = [1.5, 1.5, 1.5];
    const segs = attachWords(planDance(script, spoken, 15), spoken, [[{ start: 0, end: 1 }], [{ start: 0, end: 1.5 }], [{ start: 0, end: 1.2 }]]);
    for (const s of segs.filter((x) => x.line >= 0)) expect(s.words).toBeDefined();
    expect(segs[0].words).toBeUndefined();
    expect(segs.at(-1)!.words).toEqual([{ start: 0, end: 1 }]);
  });
});

describe("AI-sung dance reels", () => {
  it("repeats the chant as a chorus to fill the reel", () => {
    const short = danceLyrics(script, 15);
    expect(short.text.startsWith("[chorus]\nडुबी डुबी डम डम")).toBe(true);
    expect(short.lines).toEqual([0, 1, 2]);
    expect(danceLyrics(script, 60).lines.length).toBeGreaterThan(9);
  });

  it("lays segments where the song sings each line, with Whisper's word times when they fit", () => {
    const timed = [{ text: "", start: 2, end: 4 }, { text: "", start: 4.5, end: 6.5 }, { text: "", start: 7, end: 9 }];
    const heard = [2, 2.5, 3, 3.5].map((t) => ({ start: t, end: t + 0.4 }));
    const segs = songSegments(script, [0, 1, 2], timed, heard, 12);
    expect(segs.map((s) => s.line)).toEqual([-1, 0, 1, 2, -2]);
    expect(segs[0]).toMatchObject({ start: 0, end: 2 });
    expect(segs.at(-1)).toMatchObject({ start: 9, end: 12 });
    for (let i = 1; i < segs.length; i++) expect(segs[i].start).toBe(segs[i - 1].end);
    // Four words heard in line 0's four-word span: their own times, from the segment start.
    expect(segs[1].words).toEqual([0, 0.5, 1, 1.5].map((t) => ({ start: expect.closeTo(t, 9), end: expect.closeTo(t + 0.4, 9) })));
    // Line 1 has no heard words: shared out over its sung span by syllables.
    expect(segs[2].words).toHaveLength(3);
    expect(segs[2].words!.at(-1)!.end).toBeCloseTo(2, 6);
  });

  it("plays the song alone (it has its own drums), with no beat or chant voices", () => {
    const segs = songSegments(script, [0], [{ text: "", start: 1, end: 3 }], [], 6);
    const args = danceFfmpegArgs({ segments: segs, spoken: [], voices: [], beat: "", song: "song.mp3", output: "out.mp4" }, 1080, 1920);
    expect(args.filter((a) => a === "-i")).toHaveLength(2);
    expect(args).toContain("song.mp3");
    expect(args[args.indexOf("-filter_complex") + 1]).not.toContain("adelay");
  });

  it("asks the singer for the chant at the reel's tempo and length, and never speaks it", async () => {
    const asked: SongInput[] = [];
    const singer = { modelId: "ace-step-1.5", sing: async (i: SongInput) => (asked.push(i), { data: Buffer.from("song"), ext: "mp3" }) };
    const whisper = { modelId: "whisper", words: async () => [1, 1.5, 2, 2.5].map((t) => ({ start: t, end: t + 0.3 })) };
    const tts = { modelId: "kokoro-82m", speak: async () => { throw new Error("should not speak"); } } as unknown as TtsProvider;
    const llm = { modelId: "llama-3.3-70b" } as unknown as LlmProvider;
    let rendered: DanceRenderInput | undefined;
    await runDanceReel(
      { llm, tts, singer, whisper, fontsDir: "unused", render: async (input) => void (rendered = input) },
      { story: "x".repeat(30), durationSec: 15, watermark: false, danceScript: script, voice: "ai_song" },
      path.join(dir, "song-job"),
    );
    expect(asked[0]).toMatchObject({ durationSec: 15, vocalLanguage: "hi" });
    expect(asked[0].style).toContain("120 bpm");
    expect(asked[0].lyrics).toContain("गोल गोल घूमो");
    expect(rendered!.song).toBe(path.join(dir, "song-job", "song.mp3"));
    expect(rendered!.segments.at(-1)!.end).toBe(15);
    expect(rendered!.segments.find((s) => s.line === 0)!.words![0].start).toBeCloseTo(0, 6);

    await expect(
      runDanceReel({ llm, tts, fontsDir: "unused" }, { story: "x".repeat(30), durationSec: 15, watermark: false, danceScript: script, voice: "ai_song" }, path.join(dir, "x")),
    ).rejects.toThrow(/AI singing/);
  });
});

describe("dance voice option", () => {
  const body = { story: "A rain dance for toddlers, clap clap", durationSec: 15, format: "dance" };

  it("defaults to the free sung melody and charges credits only for the AI song", () => {
    const sung = parseFilmRequest("u1", body);
    expect(sung.danceVoice).toBe("sung");
    expect(paidCredits(sung)).toBeUndefined();
    expect(paidCredits(parseFilmRequest("u1", { ...body, danceVoice: "chant" }))).toBeUndefined();
    expect(paidCredits(parseFilmRequest("u1", { ...body, danceVoice: "ai_song" }))).toBe(DANCE_SONG_CREDITS);
    expect(paidCredits(parseFilmRequest("u1", { ...body, format: "story", quality: "premium" }))).toBe(3 * PREMIUM_CREDITS_PER_SHOT);
    expect(() => parseFilmRequest("u1", { ...body, danceVoice: "opera" })).toThrow(/sung, chant or AI song/);
  });

  it("lets the connector pick a voice, sung unless asked, and passes it to the reel", async () => {
    const input = ACTIONS.make_dance_reel.input;
    const base = { ...script, durationSec: 15 };
    expect(input.parse(base).voice).toBe("sung");
    expect(input.parse({ ...base, voice: "karaoke" }).voice).toBe("sung");
    expect(input.parse({ ...base, voice: "ai_song" }).voice).toBe("ai_song");
    expect(ACTIONS.make_dance_reel.description).toMatch(/"ai_song".*credits/);

    const db = await testDb();
    const now = new Date();
    await db.insert(user).values({ id: "u1", name: "One", email: "one@example.com", createdAt: now, updatedAt: now });
    const bodies: Record<string, unknown>[] = [];
    const deps = {
      db,
      llm: {} as LlmProvider,
      startFilm: async (_: string, b: unknown) => (bodies.push(b as Record<string, unknown>), { id: "00000000-0000-4000-8000-000000000001", credits: 0 }),
      rerenderEdit: async () => ({ rendersLeft: 0 }),
      enqueuePost: async () => {},
      freeReelsLeft: async () => 3,
    };
    const turn = { userId: "u1", timeZone: "Asia/Kolkata" };
    await runAction(deps, turn, "make_dance_reel", base);
    await runAction(deps, turn, "make_dance_reel", { ...base, voice: "ai_song" });
    expect(bodies.map((b) => b.danceVoice)).toEqual(["sung", "ai_song"]);
    expect(bodies[1].danceScript).not.toHaveProperty("voice");
  });
});

describe("runDanceReel sung", () => {
  it("sings every line by default, on the eighth-note grid, with word timings for the captions", async () => {
    const wav = encodeWav(fakeSpeech(6), SING_RATE);
    const tts = { modelId: "kokoro-82m", speak: async () => wav } as unknown as TtsProvider;
    const llm = { modelId: "llama-3.3-70b" } as unknown as LlmProvider;
    let rendered: DanceRenderInput | undefined;
    await runDanceReel(
      { llm, tts, fontsDir: "unused", render: async (input) => void (rendered = input) },
      { story: "x".repeat(30), durationSec: 15, watermark: false, danceScript: script },
      path.join(dir, "sung-job"),
    );
    const r = rendered!;
    expect(r.sung).toBe(true);
    expect(r.voices.every((v) => /sung-\d\.wav$/.test(v))).toBe(true);
    const eighth = beatSec(script.bpm) / 2;
    for (const s of r.spoken) expect((s / eighth) % 1).toBeCloseTo(0, 6);
    for (const s of r.segments.filter((x) => x.line >= 0)) {
      expect(s.words).toHaveLength(script.lines[s.line].text.split(" ").length);
      for (const w of s.words!) expect(((s.start + w.start) / eighth) % 1).toBeCloseTo(0, 6);
    }
    const graph = danceFfmpegArgs(r, 1080, 1920).join(" ");
    expect(graph).toContain("aecho");
    // Sung lines start SING_LEAD early, so their vowels land on the beat.
    expect(graph).toContain(`adelay=${Math.round((r.segments[1].start - SING_LEAD) * 1000)}|`);
  });
});
