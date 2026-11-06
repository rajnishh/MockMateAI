import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { probeDuration } from "@/lib/ffmpeg";
import { assertCommercialSafe } from "@/lib/models/licenses";
import { timeLines, type TimedLine, type Word } from "@/lib/music-video/timing";
import { MOTION_FPS, MOTION_SIZE } from "@/lib/motion/render";
import { AI_LABEL } from "@/lib/pipeline/assemble";
import { registerFonts } from "@/lib/pipeline/captions";
import { mapLimit, type Stage } from "@/lib/pipeline/orchestrator";
import type { SongAudio, SongInput } from "@/lib/providers/fal-music";
import type { LlmProvider, NarrationLanguage, TtsProvider } from "@/lib/providers/types";
import type { RecipeJob } from "@/lib/recipe-spec";
import { dholBeat, encodeWav } from "./beat";
import { drawDanceFrame } from "./draw";
import { applyDancePlan, beatSec, buildDancePrompt, type DanceScript, danceScriptSchema, type DanceVoice, planDance, type Segment, type WordTime } from "./script";
import { chantWords, decodePcm, SING_LEAD, SING_RATE, singChant, syllables } from "./sing";

export interface DanceDeps {
  llm: LlmProvider;
  tts: TtsProvider;
  fontsDir: string;
  probeDuration?: (file: string) => Promise<number>;
  render?: (input: DanceRenderInput) => Promise<void>;
  // Only for voice "ai_song": ACE-Step sings the chant, and Whisper's word timings place the captions.
  singer?: { readonly modelId: string; sing(input: SongInput): Promise<SongAudio> };
  whisper?: { readonly modelId: string; words(audio: Buffer): Promise<Word[]> };
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
  voice?: DanceVoice;
  // Made with a reel recipe: its scene, beat, dancers' looks and moves.
  recipe?: RecipeJob;
}

export interface DanceRenderInput {
  script: DanceScript;
  segments: Segment[];
  spoken: number[];
  voices: string[];
  beat: string;
  // Sung lines get a light reverb; an AI song replaces the beat and the voices altogether.
  sung?: boolean;
  song?: string;
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

// FFmpeg arguments: raw RGBA frames on stdin, the dhol beat underneath, each chant line delayed onto its beat
// (or, for an AI song, just the song).
export function danceFfmpegArgs(
  input: Pick<DanceRenderInput, "segments" | "spoken" | "voices" | "beat" | "output" | "sung" | "song">,
  w: number,
  h: number,
): string[] {
  const total = input.segments.at(-1)!.end;
  const args = ["-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${w}x${h}`, "-r", String(MOTION_FPS), "-i", "pipe:0"];
  const filters: string[] = [];
  if (input.song) {
    args.push("-i", input.song);
    filters.push(`[1:a]aresample=48000,afade=t=out:st=${Math.max(0, total - 0.6).toFixed(2)}:d=0.6,alimiter=limit=0.95[aout]`);
  } else {
    const placed = voicePlacements(input.segments, input.spoken);
    args.push("-i", input.beat);
    for (const p of placed) args.push("-i", input.voices[p.line]);
    filters.push(`[1:a]aresample=48000,volume=0.55[b]`);
    // A small room around the singers; spoken chants stay dry.
    const voiceFx = input.sung ? "aecho=0.8:0.6:45|80:0.22|0.12,volume=1.1" : "volume=1.6";
    placed.forEach((p, i) => {
      const ms = Math.round((p.at - (input.sung ? SING_LEAD : 0)) * 1000);
      filters.push(`[${i + 2}:a]aresample=48000,adelay=${ms}|${ms},${voiceFx}[v${i}]`);
    });
    const inputs = ["[b]", ...placed.map((_, i) => `[v${i}]`)].join("");
    filters.push(`${inputs}amix=inputs=${placed.length + 1}:duration=first:normalize=0,alimiter=limit=0.95[aout]`);
  }
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

// Gives each sung segment its words' timings: line segments their own line's, and the finale the hook's
// when the hook is sung again there.
export function attachWords(segments: Segment[], spoken: number[], words: WordTime[][]): Segment[] {
  const finale = voicePlacements(segments, spoken).find((p) => p.at === segments.at(-1)!.start && segments.at(-1)!.line === -2);
  return segments.map((s) => (s.line >= 0 ? { ...s, words: words[s.line] } : s.line === -2 && finale ? { ...s, words: words[0] } : s));
}

// Lyrics for ACE-Step: the chant as a chorus, repeated to fill the reel (about two bars a line).
export function danceLyrics(script: DanceScript, durationSec: number): { text: string; lines: number[] } {
  const bar = beatSec(script.bpm) * 4;
  const reps = Math.max(1, Math.round((durationSec - 2 * bar) / (script.lines.length * 2 * bar)));
  const lines = Array.from({ length: reps }, () => script.lines.map((_, i) => i)).flat();
  const text = Array.from({ length: reps }, () => ["[chorus]", ...script.lines.map((l) => l.text)].join("\n")).join("\n\n");
  return { text, lines };
}

// Sound only, never a real artist: a kids' dance song at the reel's tempo with its own dhol.
export const danceSongStyle = (bpm: number) =>
  `children's dance song, bhangra-style dhol beat, hand claps, cheerful, simple catchy melody, clear bright friendly vocals, ${bpm} bpm`;

// Segments for an AI song: the lines where Whisper heard them, an intro before the first and a finale after the last.
// A line's words use Whisper's own timings when it heard the right number of them, else share the line out by syllables.
export function songSegments(script: DanceScript, lineOf: number[], timed: TimedLine[], heard: Word[], durationSec: number): Segment[] {
  const segments: Segment[] = [];
  const first = timed[0]?.start ?? durationSec;
  if (first > 0.3) segments.push({ line: -1, move: "bounce", start: 0, end: first });
  timed.forEach((t, i) => {
    const line = lineOf[i];
    const start = segments.length ? segments.at(-1)!.end : 0;
    const end = Math.min(durationSec, timed[i + 1]?.start ?? t.end);
    if (end <= start) return;
    const text = chantWords(script.lines[line].text);
    const inside = heard.filter((w) => w.start >= t.start - 0.05 && w.start < end - 0.05);
    let words: WordTime[];
    if (inside.length === text.length) words = inside.map((w) => ({ start: w.start - start, end: w.end - start }));
    else {
      const weights = text.map(syllables);
      const total = weights.reduce((a, b) => a + b, 0);
      const span = Math.max(0.3, Math.min(t.end, end) - t.start);
      let acc = t.start - start;
      words = weights.map((wt) => ({ start: acc, end: (acc += (span * wt) / total) }));
    }
    segments.push({ line, move: script.lines[line].move, start, end, words });
  });
  const last = segments.at(-1)?.end ?? 0;
  if (last < durationSec) segments.push({ line: -2, move: "jump", start: last, end: durationSec });
  return segments;
}

// Dance reel: chant script → voice per line (sung to a tune by default) → beat → drawn frames.
// No image, video or music models, unless the creator chose an AI song.
export async function runDanceReel(
  deps: DanceDeps,
  req: DanceRequest,
  workDir: string,
  onStage: (stage: Stage) => Promise<void> | void = () => {},
): Promise<{ output: string; title: string }> {
  const voice = req.voice ?? "sung";
  if (voice === "ai_song" && !deps.singer) throw new Error("AI singing isn't set up on this server");
  for (const p of [deps.llm, deps.tts, ...(voice === "ai_song" ? [deps.singer, deps.whisper] : [])]) if (p) assertCommercialSafe(p.modelId);
  await mkdir(workDir, { recursive: true });

  await onStage("script");
  const plan = req.recipe?.dancePlan;
  const written = req.danceScript ?? danceScriptSchema.parse(await deps.llm.completeJson(buildDancePrompt({ ...req, lines: plan?.moves.length })));
  const script = plan ? applyDancePlan(written, plan) : written;
  await writeFile(path.join(workDir, "script.json"), JSON.stringify(script, null, 2));

  await onStage("audio");
  const base = { script, captions: req.captions, handle: req.handle, watermark: req.watermark, fontsDir: deps.fontsDir, output: path.join(workDir, "film.mp4") };
  let render: DanceRenderInput;
  if (voice === "ai_song") {
    const lyrics = danceLyrics(script, req.durationSec);
    const sung = await deps.singer!.sing({ style: danceSongStyle(script.bpm), lyrics: lyrics.text, durationSec: req.durationSec, vocalLanguage: script.language });
    const song = path.join(workDir, `song.${sung.ext}`);
    await writeFile(song, sung.data);
    let heard: Word[] = [];
    try {
      heard = (await deps.whisper?.words(sung.data)) ?? [];
    } catch (err) {
      console.error("Dance song timing fell back to even spacing:", (err as Error).message);
    }
    const timed = timeLines(lyrics.lines.map((i) => script.lines[i].text), heard, req.durationSec);
    const segments = songSegments(script, lyrics.lines, timed, heard, req.durationSec);
    render = { ...base, segments, spoken: [], voices: [], beat: "", song };
  } else {
    const speech = await mapLimit(script.lines, 3, (line) => deps.tts.speak({ text: line.text, language: script.language }));
    let voices: string[];
    let spoken: number[];
    let words: WordTime[][] | undefined;
    if (voice === "sung") {
      const { audio, melodies } = singChant(await Promise.all(speech.map((b) => decodePcm(b))), script);
      voices = await Promise.all(audio.map(async (pcm, i) => {
        const file = path.join(workDir, `sung-${i}.wav`);
        await writeFile(file, encodeWav(pcm, SING_RATE));
        return file;
      }));
      spoken = melodies.map((m) => m.durationSec);
      words = melodies.map((m) => m.words);
    } else {
      voices = await Promise.all(speech.map(async (b, i) => {
        const file = path.join(workDir, `chant-${i}.wav`);
        await writeFile(file, b);
        return file;
      }));
      spoken = await Promise.all(voices.map(deps.probeDuration ?? probeDuration));
    }
    let segments = planDance(script, spoken, req.durationSec);
    if (words) segments = attachWords(segments, spoken, words);
    const beat = path.join(workDir, "beat.wav");
    await writeFile(beat, dholBeat(script.bpm, req.durationSec));
    render = { ...base, segments, spoken, voices, beat, sung: voice === "sung" };
  }
  await writeFile(path.join(workDir, "timing.json"), JSON.stringify({ voice, segments: render.segments }, null, 2));

  await onStage("assemble");
  await (deps.render ?? renderDanceVideo)(render);
  await onStage("done");
  return { output: render.output, title: script.title };
}
