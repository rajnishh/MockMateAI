import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { readMedia } from "@/lib/media";
import { assertCommercialSafe } from "@/lib/models/licenses";
import { buildMusicVideoArgs } from "@/lib/pipeline/assemble";
import { type Cue, renderCaptionImages } from "@/lib/pipeline/captions";
import { defaultFfmpeg, probeDuration } from "@/lib/ffmpeg";
import { mapLimit, PHOTO_LIKENESS } from "@/lib/pipeline/orchestrator";
import { STYLE_HINTS } from "@/lib/pipeline/script";
import { fillBlockedFrames, generateKeyframeSafely } from "@/lib/providers/safety";
import type { CharacterProfile, FilmStyle, ImageProvider, LlmProvider, Resolution, VideoProvider } from "@/lib/providers/types";
import { planScenes, type Scene, singableLines, type TimedLine, timeLines, type Word } from "./timing";

export interface MusicVideoDeps {
  llm: LlmProvider;
  image: ImageProvider;
  video: VideoProvider;
  // "Sing it yourself": makes each scene's star lip-sync that stretch of the song.
  singer?: { readonly modelId: string; sing(input: { imageUrl: string; audioUrl: string; prompt: string }): Promise<{ url: string }> };
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
  // The creator's photo: the star has this person's face in every scene.
  photoUrl?: string;
  // The star sings the song in every scene, lip-synced (needs deps.singer).
  singer?: boolean;
  kidSafe?: boolean;
  captions?: boolean;
}

// What every scene shows when the star sings it: their face and mouth clearly.
export const SINGER_SHOT = "the star is singing towards the camera in a medium close-up, face and mouth clearly visible";

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
    req.singer ? `The star sings every segment: every imagePrompt shows ${SINGER_SHOT}, in a setting that fits the lyrics.` : "",
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

// One stretch of the song as an MP3 data URI, which fal accepts in place of a link.
async function songStretch(runFfmpeg: (args: string[]) => Promise<void>, song: string, start: number, seconds: number, file: string): Promise<string> {
  await runFfmpeg(["-y", "-ss", String(start), "-t", String(seconds), "-i", song, "-vn", "-ac", "2", "-ar", "44100", "-b:a", "160k", file]);
  return `data:audio/mpeg;base64,${(await readFile(file)).toString("base64")}`;
}

export async function runMusicVideo(
  deps: MusicVideoDeps,
  req: MusicVideoRequest,
  workDir: string,
  onStage: (stage: MusicVideoStage) => Promise<void> | void = () => {},
): Promise<{ output: string; title: string }> {
  if (req.singer && !deps.singer) throw new Error("Lip-synced music videos aren't set up on this server");
  for (const p of [deps.llm, deps.image, deps.video, deps.whisper, req.singer ? deps.singer : undefined]) if (p) assertCommercialSafe(p.modelId);
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
  let prompts = await writeScenePrompts(deps.llm, req, scenes);
  if (req.photoUrl) prompts = prompts.map((p) => ({ ...p, imagePrompt: `${p.imagePrompt}. ${PHOTO_LIKENESS}` }));
  await writeFile(path.join(workDir, "music-video.json"), JSON.stringify({ duration, timed, scenes, prompts }, null, 2));

  await onStage("keyframes");
  const seed = req.character?.seed;
  const refs = [...(req.photoUrl ? [req.photoUrl] : []), ...(req.character ? [req.character.referenceImageUrl] : [])];
  const frames = fillBlockedFrames(
    await mapLimit(prompts, 3, (p) => generateKeyframeSafely(deps.image, { prompt: p.imagePrompt, referenceImageUrls: refs, seed })),
  );

  await onStage("clips");
  const durations = scenes.map((s) => Math.round((s.end - s.start) * 100) / 100);
  const clips = await mapLimit(scenes, 3, async (scene, i) => {
    // A singing scene is animated from its own stretch of the song, so the lips match when the
    // song plays over the finished video.
    const clip =
      req.singer && deps.singer
        ? await deps.singer.sing({
            imageUrl: frames[i].url,
            audioUrl: await songStretch(runFfmpeg, song, scene.start, durations[i], path.join(workDir, `sing-${i}.mp3`)),
            prompt: `${prompts[i].motionPrompt}; ${SINGER_SHOT}`,
          })
        : await deps.video.animate({
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
