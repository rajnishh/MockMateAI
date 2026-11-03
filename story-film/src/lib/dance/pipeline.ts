import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { probeDuration } from "@/lib/ffmpeg";
import { assertCommercialSafe } from "@/lib/models/licenses";
import { MOTION_FPS, MOTION_SIZE } from "@/lib/motion/render";
import { AI_LABEL } from "@/lib/pipeline/assemble";
import { registerFonts } from "@/lib/pipeline/captions";
import { mapLimit, type Stage } from "@/lib/pipeline/orchestrator";
import type { LlmProvider, NarrationLanguage, TtsProvider } from "@/lib/providers/types";
import { dholBeat } from "./beat";
import { drawDanceFrame } from "./draw";
import { buildDancePrompt, type DanceScript, danceScriptSchema, planDance, type Segment } from "./script";

export interface DanceDeps {
  llm: LlmProvider;
  tts: TtsProvider;
  fontsDir: string;
  probeDuration?: (file: string) => Promise<number>;
  render?: (input: DanceRenderInput) => Promise<void>;
}

export interface DanceRequest {
  story: string;
  durationSec: number;
  watermark: boolean;
  language?: NarrationLanguage;
  captions?: boolean;
  handle?: string;
  // Written by the creator's own assistant; otherwise Reelkar's LLM writes one from the story.
  danceScript?: DanceScript;
}

export interface DanceRenderInput {
  script: DanceScript;
  segments: Segment[];
  spoken: number[];
  voices: string[];
  beat: string;
  captions?: boolean;
  handle?: string;
  watermark: boolean;
  fontsDir: string;
  output: string;
}

// Where each chant line is heard: every line segment, plus the hook again in the finale if it fits.
export function voicePlacements(segments: Segment[], spoken: number[]): { line: number; at: number }[] {
  const out = segments.filter((s) => s.line >= 0).map((s) => ({ line: s.line, at: s.start }));
  const finale = segments.at(-1);
  if (finale?.line === -2 && finale.end - finale.start >= (spoken[0] ?? 0) + 0.1) out.push({ line: 0, at: finale.start });
  return out;
}

// FFmpeg arguments: raw RGBA frames on stdin, the dhol beat underneath, each chant line delayed onto its beat.
export function danceFfmpegArgs(input: Pick<DanceRenderInput, "segments" | "spoken" | "voices" | "beat" | "output">, w: number, h: number): string[] {
  const total = input.segments.at(-1)!.end;
  const placed = voicePlacements(input.segments, input.spoken);
  const args = ["-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${w}x${h}`, "-r", String(MOTION_FPS), "-i", "pipe:0", "-i", input.beat];
  for (const p of placed) args.push("-i", input.voices[p.line]);
  const filters = [`[1:a]aresample=48000,volume=0.55[b]`];
  placed.forEach((p, i) => {
    const ms = Math.round(p.at * 1000);
    filters.push(`[${i + 2}:a]aresample=48000,adelay=${ms}|${ms},volume=1.6[v${i}]`);
  });
  const inputs = ["[b]", ...placed.map((_, i) => `[v${i}]`)].join("");
  filters.push(`${inputs}amix=inputs=${placed.length + 1}:duration=first:normalize=0,alimiter=limit=0.95[aout]`);
  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "0:v", "-map", "[aout]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k",
    "-t", total.toFixed(2),
    "-movflags", "+faststart",
    "-metadata", `comment=${AI_LABEL}`,
    input.output,
  );
  return args;
}

export async function renderDanceVideo(input: DanceRenderInput): Promise<void> {
  registerFonts(input.fontsDir);
  const { w, h } = MOTION_SIZE;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  const ff = spawn("ffmpeg", danceFfmpegArgs(input, w, h), { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  ff.stderr.on("data", (d) => (stderr = (stderr + d).slice(-4000)));
  const done = new Promise<void>((resolve, reject) => {
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr}`))));
  });
  const frames = Math.round(input.segments.at(-1)!.end * MOTION_FPS);
  for (let i = 0; i < frames; i++) {
    drawDanceFrame({ ctx, w, h, t: i / MOTION_FPS, script: input.script, segments: input.segments, spoken: input.spoken, watermark: input.watermark, handle: input.handle, captions: input.captions });
    const pixels = ctx.getImageData(0, 0, w, h).data;
    if (!ff.stdin.write(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength))) {
      await new Promise<void>((r) => ff.stdin.once("drain", () => r()));
    }
  }
  ff.stdin.end();
  await done;
}

// Dance reel: chant script → voice per line → beat → drawn frames. No image, video or music models.
export async function runDanceReel(
  deps: DanceDeps,
  req: DanceRequest,
  workDir: string,
  onStage: (stage: Stage) => Promise<void> | void = () => {},
): Promise<{ output: string; title: string }> {
  for (const p of [deps.llm, deps.tts]) assertCommercialSafe(p.modelId);
  await mkdir(workDir, { recursive: true });

  await onStage("script");
  const script = req.danceScript ?? danceScriptSchema.parse(await deps.llm.completeJson(buildDancePrompt(req)));
  await writeFile(path.join(workDir, "script.json"), JSON.stringify(script, null, 2));

  await onStage("audio");
  const voices = await mapLimit(script.lines, 3, async (line, i) => {
    const file = path.join(workDir, `chant-${i}.wav`);
    await writeFile(file, await deps.tts.speak({ text: line.text, language: script.language }));
    return file;
  });
  const spoken = await Promise.all(voices.map(deps.probeDuration ?? probeDuration));
  const segments = planDance(script, spoken, req.durationSec);
  const beat = path.join(workDir, "beat.wav");
  await writeFile(beat, dholBeat(script.bpm, req.durationSec));

  await onStage("assemble");
  const output = path.join(workDir, "film.mp4");
  await (deps.render ?? renderDanceVideo)({ script, segments, spoken, voices, beat, captions: req.captions, handle: req.handle, watermark: req.watermark, fontsDir: deps.fontsDir, output });
  await onStage("done");
  return { output, title: script.title };
}
