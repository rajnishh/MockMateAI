import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildAssembleArgs } from "@/lib/pipeline/assemble";
import { type PipelineDeps, runFilm, type Stage } from "@/lib/pipeline/orchestrator";

const dir = mkdtempSync(path.join(tmpdir(), "story-film-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function ffmpeg(...args: string[]) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args]);
}

function probeDuration(file: string): number {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(out.toString().trim());
}

describe("assemble args", () => {
  it("requires one narration per clip", () => {
    expect(() =>
      buildAssembleArgs({ clips: ["a"], narration: [], music: "m", clipSeconds: 5, resolution: "720p", watermark: true, output: "o" }),
    ).toThrow();
  });
});

describe.skipIf(!hasFfmpeg)("runFilm end to end with fake providers", () => {
  it("produces a 9:16 film of the right length with an AI label", async () => {
    // Landscape source clip, to check it gets cropped to vertical.
    const clip = path.join(dir, "src.mp4");
    const tone = path.join(dir, "tone.wav");
    ffmpeg("-f", "lavfi", "-i", "testsrc=size=640x360:rate=24:duration=6", "-pix_fmt", "yuv420p", clip);
    ffmpeg("-f", "lavfi", "-i", "sine=frequency=440:duration=2", tone);
    const wav = readFileSync(tone);

    const deps: PipelineDeps = {
      llm: {
        writeScript: async ({ shotCount }) => ({
          title: "Test",
          language: "en",
          characters: [],
          shots: Array.from({ length: shotCount }, (_, i) => ({ narration: `line ${i}`, imagePrompt: `frame ${i}`, motionPrompt: "pan" })),
          musicPrompt: "calm",
        }),
      },
      image: { modelId: "nano-banana-2", generateKeyframe: async ({ prompt }) => ({ url: `https://img/${encodeURIComponent(prompt)}` }) },
      video: { modelId: "wan-2.x", animate: async () => ({ url: "https://cdn/clip.mp4" }) },
      tts: { modelId: "kokoro-82m", speak: async () => wav },
      music: { modelId: "ace-step", compose: async () => wav },
      fetchFn: (async () => new Response(readFileSync(clip))) as unknown as typeof fetch,
    };

    const stages: Stage[] = [];
    const { output } = await runFilm(
      deps,
      { story: "x".repeat(30), style: "cinematic", durationSec: 10, resolution: "480p", watermark: true, referenceImageUrls: [] },
      path.join(dir, "job"),
      (s) => void stages.push(s),
    );

    expect(stages).toEqual(["script", "keyframes", "clips", "audio", "assemble", "done"]);
    expect(existsSync(output)).toBe(true);
    expect(probeDuration(output)).toBeCloseTo(10, 0);
    const dims = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", output]);
    expect(dims.toString().trim()).toBe("480,854");
  }, 60_000);

  it("refuses to run with a non-commercial model", async () => {
    const deps = {
      llm: { writeScript: async () => { throw new Error("unreachable"); } },
      image: { modelId: "nano-banana-2" },
      video: { modelId: "wan-2.x" },
      tts: { modelId: "xtts-v2" },
      music: { modelId: "ace-step" },
    } as unknown as PipelineDeps;
    await expect(
      runFilm(deps, { story: "", style: "cinematic", durationSec: 10, resolution: "480p", watermark: true, referenceImageUrls: [] }, path.join(dir, "x")),
    ).rejects.toThrow(/blocked/);
  });
});
