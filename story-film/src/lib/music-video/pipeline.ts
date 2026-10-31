import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { readMedia } from "@/lib/media";
import { assertCommercialSafe } from "@/lib/models/licenses";
import { buildMusicVideoArgs } from "@/lib/pipeline/assemble";
import { type Cue, renderCaptionImages } from "@/lib/pipeline/captions";
import { defaultFfmpeg, probeDuration } from "@/lib/ffmpeg";
import { mapLimit } from "@/lib/pipeline/orchestrator";
import { STYLE_HINTS } from "@/lib/pipeline/script";
import type { CharacterProfile, FilmStyle, ImageProvider, LlmProvider, Resolution, VideoProvider } from "@/lib/providers/types";
import { planScenes, type Scene, singableLines, type TimedLine, timeLines, type Word } from "./timing";

export interface MusicVideoDeps {
  llm: LlmProvider;
  image: ImageProvider;
  video: VideoProvider;
  // Word timings for lyric sync; without it lines are spread evenly.
  whisper?: { readonly modelId: string; words(audio: Buffer): Promise<Word[]> };
  fetchFn?: typeof fetch;
  runFfmpeg?: (args: string[]) => Promise<void>;
  probeDuration?: (file: string) => Promise<number>;
  fontsDir?: string;
}

export interface MusicVideoRequest {
  songFile: string;
  title: string;
  lyrics: string;
  genre: string;
  mood: string;
  style: FilmStyle;
  resolution: Resolution;
  watermark: boolean;
  // Scene length bounds; AI clips are 5s, so premium uses a 5s maximum.
  sceneSec: { min: number; max: number };
  character?: CharacterProfile;
  kidSafe?: boolean;
  captions?: boolean;
}

export type MusicVideoStage = "timing" | "scenes" | "keyframes" | "clips" | "assemble" | "done";

const scenePromptsSchema = z.object({
  scenes: z.array(z.object({ imagePrompt: z.string().min(1), motionPrompt: z.string().default("slow camera move") })).min(1),
});

export function buildScenePrompt(req: MusicVideoRequest, scenes: Scene[]): string {
  return [
    "You are directing a vertical (9:16) music video. Write one visual scene per segment of the song.",
    `Song: "${req.title}". Genre: ${req.genre}. Mood: ${req.mood || "any"}.`,
    req.character
      ? `The star is ${req.character.name}: ${req.character.description}. Include "${req.character.name}, ${req.character.description}" verbatim in every imagePrompt where they appear.`
      : "Invent one consistent lead character with a fixed visual description and repeat it verbatim in every imagePrompt where they appear.",
    req.kidSafe ? "Audience is young children: gentle, bright, safe imagery only." : "",
    "Scenes should follow the lyrics' meaning and build visually; instrumental segments get atmospheric shots.",
    "Never depict real singers, celebrities or brands.",
    `imagePrompt and motionPrompt are in English. Every imagePrompt ends with: "${STYLE_HINTS[req.style]}".`,
    `Return exactly ${scenes.length} scenes, in order.`,
    'Reply with JSON only: {"scenes":[{"imagePrompt":string,"motionPrompt":string}]}',
    "",
    ...scenes.map((s, i) => `Segment ${i + 1} (${s.start}s-${s.end}s): ${s.lines.length ? s.lines.join(" / ") : "(instrumental)"}`),
  ]
    .filter(Boolean)
    .join("\n");
}

export async function writeScenePrompts(llm: LlmProvider, req: MusicVideoRequest, scenes: Scene[]) {
  const out = scenePromptsSchema.parse(await llm.completeJson(buildScenePrompt(req, scenes))).scenes;
  // Models occasionally miscount; reuse the last scene rather than fail the video.
  return scenes.map((_, i) => out[Math.min(i, out.length - 1)]);
}

const MAX_CAPTION_CHARS = 32;

// Long lines become two captions so the text stays large enough to read.
export function lyricCues(lines: TimedLine[]): Cue[] {
  return lines.flatMap((l) => {
    if (l.text.length <= MAX_CAPTION_CHARS) return [{ start: l.start, end: l.end, text: l.text }];
    const words = l.text.split(/\s+/);
    const half = Math.ceil(words.length / 2);
    const mid = Math.round((l.start + (l.end - l.start) / 2) * 100) / 100;
    return [
      { start: l.start, end: mid, text: words.slice(0, half).join(" ") },
      { start: mid, end: l.end, text: words.slice(half).join(" ") },
    ];
  });
}

export async function runMusicVideo(
  deps: MusicVideoDeps,
  req: MusicVideoRequest,
  workDir: string,
  onStage: (stage: MusicVideoStage) => Promise<void> | void = () => {},
): Promise<{ output: string; title: string }> {
  for (const p of [deps.llm, deps.image, deps.video, deps.whisper]) if (p) assertCommercialSafe(p.modelId);
  const fetchFn = deps.fetchFn ?? fetch;
  const runFfmpeg = deps.runFfmpeg ?? defaultFfmpeg;
  await mkdir(workDir, { recursive: true });
  const song = path.join(workDir, `song${path.extname(req.songFile)}`);
  await copyFile(req.songFile, song);

  await onStage("timing");
  const duration = await (deps.probeDuration ?? probeDuration)(song);
  let words: Word[] = [];
  if (deps.whisper) {
    try {
      words = await deps.whisper.words(await readMedia(`file://${song}`));
    } catch (err) {
      console.error("Lyric timing fell back to even spacing:", (err as Error).message);
    }
  }
  const timed = timeLines(singableLines(req.lyrics), words, duration);

  await onStage("scenes");
  const scenes = planScenes(timed, duration, req.sceneSec.min, req.sceneSec.max);
  const prompts = await writeScenePrompts(deps.llm, req, scenes);
  await writeFile(path.join(workDir, "music-video.json"), JSON.stringify({ duration, timed, scenes, prompts }, null, 2));

  await onStage("keyframes");
  const seed = req.character?.seed;
  const refs = req.character ? [req.character.referenceImageUrl] : [];
  const frames = await mapLimit(prompts, 3, (p) => deps.image.generateKeyframe({ prompt: p.imagePrompt, referenceImageUrls: refs, seed }));

  await onStage("clips");
  const durations = scenes.map((s) => Math.round((s.end - s.start) * 100) / 100);
  const clips = await mapLimit(scenes, 3, async (_, i) => {
    const clip = await deps.video.animate({
      imageUrl: frames[i].url,
      prompt: prompts[i].motionPrompt,
      durationSec: Math.ceil(durations[i]),
      resolution: req.resolution,
    });
    const file = path.join(workDir, `clip-${i}.mp4`);
    await writeFile(file, await readMedia(clip.url, fetchFn));
    return file;
  });

  await onStage("assemble");
  const captions =
    req.captions === false
      ? undefined
      : await renderCaptionImages(lyricCues(timed), req.resolution, path.resolve(/*turbopackIgnore: true*/ deps.fontsDir ?? "assets/fonts"), workDir);
  const output = path.join(workDir, "film.mp4");
  await runFfmpeg(buildMusicVideoArgs({ clips, durations, song, resolution: req.resolution, watermark: req.watermark, output, captions }));

  await onStage("done");
  return { output, title: req.title };
}
