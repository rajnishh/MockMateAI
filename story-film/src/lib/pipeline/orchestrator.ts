import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultFfmpeg, probeDuration } from "@/lib/ffmpeg";
import { readMedia } from "@/lib/media";
import { assertCommercialSafe } from "@/lib/models/licenses";
import type {
  CharacterProfile,
  FilmScript,
  FilmStyle,
  NarrationLanguage,
  ImageProvider,
  LlmProvider,
  MusicProvider,
  Resolution,
  TtsProvider,
  VideoProvider,
} from "@/lib/providers/types";
import { cleanImagePrompt, fillBlockedFrames, generateKeyframeSafely } from "@/lib/providers/safety";
import { CLIP_SECONDS, shotCountFor } from "@/lib/quota/plans";
import { buildAssembleArgs } from "./assemble";
import { buildCues, renderCaptionImages } from "./captions";

export interface FilmRequest {
  story: string;
  style: FilmStyle;
  durationSec: number;
  resolution: Resolution;
  watermark: boolean;
  // Show the visible "Created with AI" label (the creator's choice).
  aiLabel?: boolean;
  referenceImageUrls: string[];
  character?: CharacterProfile;
  // The creator's photo: every picture keeps this person's face and look.
  photoUrl?: string;
  kidSafe?: boolean;
  language?: NarrationLanguage;
  captions?: boolean;
  // Written by the creator's own assistant; otherwise the LLM writes one from the story.
  script?: FilmScript;
}

export interface PipelineDeps {
  llm: LlmProvider;
  image: ImageProvider;
  video: VideoProvider;
  tts: TtsProvider;
  music?: MusicProvider;
  fetchFn?: typeof fetch;
  runFfmpeg?: (args: string[]) => Promise<void>;
  probeDuration?: (file: string) => Promise<number>;
  fontsDir?: string;
}

// Added to every picture prompt when the creator gave a photo.
export const PHOTO_LIKENESS = "The main person has exactly the face, skin tone, hair and build of the person in the first reference photo";

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
  await writeFile(file, await readMedia(url, fetchFn));
  return file;
}

// Re-exported for existing callers; new code imports from @/lib/ffmpeg.
export { defaultFfmpeg, probeDuration };

export async function runFilm(
  deps: PipelineDeps,
  req: FilmRequest,
  workDir: string,
  onStage: (stage: Stage) => Promise<void> | void = () => {},
): Promise<{ output: string; title: string }> {
  for (const p of [deps.llm, deps.image, deps.video, deps.tts, deps.music]) if (p) assertCommercialSafe(p.modelId);
  const fetchFn = deps.fetchFn ?? fetch;
  await mkdir(workDir, { recursive: true });

  await onStage("script");
  let script = req.script ?? await deps.llm.writeScript({
    story: req.story,
    style: req.style,
    shotCount: shotCountFor(req.durationSec),
    character: req.character,
    kidSafe: req.kidSafe,
    language: req.language,
  });
  // Image filters often misread children's scenes (bath time, bedtime), so kids' prompts skip those words up front.
  if (req.kidSafe) script = { ...script, shots: script.shots.map((s) => ({ ...s, imagePrompt: cleanImagePrompt(s.imagePrompt) })) };
  await writeFile(path.join(workDir, "script.json"), JSON.stringify(script, null, 2));

  // A saved character's reference image anchors identity; otherwise the
  // first keyframe does. The seed helps text-only image models stay on model.
  await onStage("keyframes");
  const seed = req.character?.seed;
  const refs = [
    ...(req.photoUrl ? [req.photoUrl] : []),
    ...(req.character ? [req.character.referenceImageUrl] : []),
    ...req.referenceImageUrls,
  ];
  if (req.photoUrl) {
    script = { ...script, shots: script.shots.map((s) => ({ ...s, imagePrompt: `${s.imagePrompt}. ${PHOTO_LIKENESS}` })) };
  }
  const [first, ...rest] = script.shots;
  // A shot the safety filter blocks twice reuses a neighbouring picture instead of failing the reel.
  const firstFrame = await generateKeyframeSafely(deps.image, { prompt: first.imagePrompt, referenceImageUrls: refs, seed });
  const anchors = req.character || !firstFrame ? refs : [...refs, firstFrame.url].slice(-5);
  const restFrames = await mapLimit(rest, 3, (shot) =>
    generateKeyframeSafely(deps.image, { prompt: shot.imagePrompt, referenceImageUrls: anchors, seed }),
  );
  const frames = fillBlockedFrames([firstFrame, ...restFrames]);

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
  let music: string | undefined;
  if (deps.music) {
    music = path.join(workDir, "music.wav");
    await writeFile(music, await deps.music.compose({ prompt: script.musicPrompt, durationSec: clips.length * CLIP_SECONDS }));
  }

  await onStage("assemble");
  let captions;
  if (req.captions !== false) {
    const durations = await Promise.all(narration.map(deps.probeDuration ?? probeDuration));
    const cues = buildCues(script.shots.map((s) => s.narration), durations, CLIP_SECONDS);
    captions = await renderCaptionImages(cues, req.resolution, path.resolve(/*turbopackIgnore: true*/ deps.fontsDir ?? "assets/fonts"), workDir);
  }
  const output = path.join(workDir, "film.mp4");
  await (deps.runFfmpeg ?? defaultFfmpeg)(
    buildAssembleArgs({
      clips,
      narration,
      music,
      clipSeconds: CLIP_SECONDS,
      resolution: req.resolution,
      watermark: req.watermark,
      aiLabel: req.aiLabel,
      output,
      captions,
    }),
  );

  await onStage("done");
  return { output, title: script.title };
}
