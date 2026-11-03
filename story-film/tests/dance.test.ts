import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { dholBeat, SAMPLE_RATE } from "@/lib/dance/beat";
import { poseFor } from "@/lib/dance/draw";
import { danceFfmpegArgs, type DanceRenderInput, runDanceReel, voicePlacements } from "@/lib/dance/pipeline";
import { beatSec, DANCE_MOVES, type DanceScript, danceScriptSchema, planDance } from "@/lib/dance/script";
import type { LlmProvider, TtsProvider } from "@/lib/providers/types";

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
      { story: "A rain dance for toddlers", durationSec: 15, watermark: false, language: "hi" },
      path.join(dir, "job2"),
    );
    expect(prompts[0]).toContain("A rain dance for toddlers");
    expect(prompts[0]).toMatch(/Never copy lyrics/);
    expect(rendered!.segments.at(-1)!.end).toBe(15);
    expect(rendered!.voices).toHaveLength(3);
    expect(rendered!.spoken).toEqual([1.5, 1.5, 1.5]);
  });
});
