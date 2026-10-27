import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { assertCommercialSafe } from "@/lib/models/licenses";
import type { FilmStyle, ImageProvider, LlmProvider, MusicProvider, Resolution, TtsProvider, VideoProvider } from "@/lib/providers/types";
import { CLIP_SECONDS, shotCountFor } from "@/lib/quota/plans";
import { buildAssembleArgs } from "./assemble";

const execFileAsync = promisify(execFile);

export interface FilmRequest {
  story: string;
  style: FilmStyle;
  durationSec: number;
  resolution: Resolution;
  watermark: boolean;
  referenceImageUrls: string[];
}

export interface PipelineDeps {
  llm: LlmProvider;
  image: ImageProvider;
  video: VideoProvider;
  tts: TtsProvider;
  music: MusicProvider;
  fetchFn?: typeof fetch;
  runFfmpeg?: (args: string[]) => Promise<void>;
}

export type Stage = "script" | "keyframes" | "clips" | "audio" | "assemble" | "done";

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

async function download(fetchFn: typeof fetch, url: string, file: string): Promise<string> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

async function defaultFfmpeg(args: string[]): Promise<void> {
  await execFileAsync("ffmpeg", args, { maxBuffer: 16 * 1024 * 1024 });
}

export async function runFilm(
  deps: PipelineDeps,
  req: FilmRequest,
  workDir: string,
  onStage: (stage: Stage) => Promise<void> | void = () => {},
): Promise<{ output: string; title: string }> {
  for (const p of [deps.image, deps.video, deps.tts, deps.music]) assertCommercialSafe(p.modelId);
  const fetchFn = deps.fetchFn ?? fetch;
  await mkdir(workDir, { recursive: true });

  await onStage("script");
  const script = await deps.llm.writeScript({ story: req.story, style: req.style, shotCount: shotCountFor(req.durationSec) });
  await writeFile(path.join(workDir, "script.json"), JSON.stringify(script, null, 2));

  // The first keyframe anchors character identity for the rest.
  await onStage("keyframes");
  const [first, ...rest] = script.shots;
  const firstFrame = await deps.image.generateKeyframe({ prompt: first.imagePrompt, referenceImageUrls: req.referenceImageUrls });
  const anchors = [...req.referenceImageUrls, firstFrame.url].slice(-5);
  const restFrames = await mapLimit(rest, 3, (shot) =>
    deps.image.generateKeyframe({ prompt: shot.imagePrompt, referenceImageUrls: anchors }),
  );
  const frames = [firstFrame, ...restFrames];

  await onStage("clips");
  const clips = await mapLimit(script.shots, 3, async (shot, i) => {
    const clip = await deps.video.animate({
      imageUrl: frames[i].url,
      prompt: shot.motionPrompt,
      durationSec: CLIP_SECONDS,
      resolution: req.resolution,
    });
    return download(fetchFn, clip.url, path.join(workDir, `clip-${i}.mp4`));
  });

  await onStage("audio");
  const narration = await mapLimit(script.shots, 3, async (shot, i) => {
    const file = path.join(workDir, `narration-${i}.wav`);
    await writeFile(file, await deps.tts.speak({ text: shot.narration, language: script.language }));
    return file;
  });
  const music = path.join(workDir, "music.wav");
  await writeFile(music, await deps.music.compose({ prompt: script.musicPrompt, durationSec: clips.length * CLIP_SECONDS }));

  await onStage("assemble");
  const output = path.join(workDir, "film.mp4");
  await (deps.runFfmpeg ?? defaultFfmpeg)(
    buildAssembleArgs({ clips, narration, music, clipSeconds: CLIP_SECONDS, resolution: req.resolution, watermark: req.watermark, output }),
  );

  await onStage("done");
  return { output, title: script.title };
}
