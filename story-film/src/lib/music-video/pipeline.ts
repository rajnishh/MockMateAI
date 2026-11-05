import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { readMedia } from "@/lib/media";
import { assertCommercialSafe } from "@/lib/models/licenses";
import { type Cue, renderCaptionImages } from "@/lib/pipeline/captions";
import { defaultFfmpeg, probeDuration } from "@/lib/ffmpeg";
import { mapLimit, PHOTO_LIKENESS } from "@/lib/pipeline/orchestrator";
import { STYLE_HINTS } from "@/lib/pipeline/script";
import type { MusicVideoProviders } from "@/lib/providers/fal-music-video";
import { fillBlockedFrames, generateKeyframeSafely } from "@/lib/providers/safety";
import type { CharacterProfile, FilmStyle, ImageProvider, LlmProvider, Resolution, VideoProvider } from "@/lib/providers/types";
import { buildMusicVideoCutArgs, renderBigLyrics } from "./assemble";
import { type BeatGrid, detectBeats, evenGrid, pcmArgs, readPcm } from "./beats";
import { DANCE_STYLE_INFO, libraryClip, referenceClipArgs } from "./dance";
import { type DanceStyle, type MusicVideoKind, type PlannedShot, planShots, type ShotType } from "./shots";
import { singableLines, type TimedLine, timeLines, type Word } from "./timing";

export interface MusicVideoDeps {
  llm: LlmProvider;
  // Keyframes: free Flux for lyric videos, Nano Banana (which keeps the star's face) otherwise.
  image: ImageProvider;
  // Pan-and-zoom over a still: every lyric video shot, and the stand-in when an AI shot fails.
  stills: VideoProvider;
  // The paid models; needed to render story, performance and full videos.
  av?: MusicVideoProviders;
  // Word timings for lyric sync; without it lines are spread evenly.
  whisper?: { readonly modelId: string; words(audio: Buffer): Promise<Word[]> };
  fetchFn?: typeof fetch;
  runFfmpeg?: (args: string[]) => Promise<void>;
  probeDuration?: (file: string) => Promise<number>;
  fontsDir?: string;
  assetsDir?: string;
}

export interface MusicVideoRequest {
  kind: MusicVideoKind;
  songFile: string;
  title: string;
  lyrics: string;
  genre: string;
  mood: string;
  style: FilmStyle;
  resolution: Resolution;
  watermark: boolean;
  character?: CharacterProfile;
  // The creator's photo: the star has this person's face in every shot.
  photoUrl?: string;
  kidSafe?: boolean;
  captions?: boolean;
  danceStyle?: DanceStyle;
  // A clip the creator uploaded of themselves dancing; used instead of the built-in library.
  danceClipFile?: string;
  // Only this part of the song, in seconds; the whole song when absent.
  range?: { start: number; end: number };
  // The song's tempo when known (ACE-Step songs carry it).
  bpm?: number;
}

export type MusicVideoPhase = "storyboard" | "render" | "all";
export type MusicVideoStage = "timing" | "beats" | "scenes" | "keyframes" | "stems" | "clips" | "assemble" | "done";

export interface StoryboardShot extends PlannedShot {
  imagePrompt: string;
  motionPrompt: string;
  // The keyframe (file:// URL); missing when the creator changed the shot and it needs drawing.
  frame?: string;
}

// Saved as storyboard.json in the video's folder: what the creator checks before paying.
export interface Storyboard {
  kind: MusicVideoKind;
  title: string;
  duration: number;
  offset: number;
  bpm: number;
  downbeats: number[];
  timed: TimedLine[];
  star?: { description: string; image?: string };
  look: { style: FilmStyle; photoUrl?: string; kidSafe?: boolean; danceStyle?: DanceStyle };
  shots: StoryboardShot[];
  redraws: number;
}

export const STORYBOARD_FILE = "storyboard.json";

// What every singing shot shows: the star's face and mouth clearly.
export const SINGER_SHOT = "the star is singing towards the camera in a medium close-up, face and mouth clearly visible";
// Motion control needs the whole body in the picture.
// Alone, too: with other people in the picture it may animate the wrong dancer.
export const DANCER_SHOT = "the star is alone, with no other people in the picture, shown full body from head to toe, standing in the middle of the frame with open space around them, facing the camera";
const LYRIC_ART = "vivid illustrated background art, no people, no text, no letters, no words";

const promptsSchema = z.object({
  star: z.string().default(""),
  shots: z.array(z.object({ imagePrompt: z.string().min(1), motionPrompt: z.string().default("slow camera move") })).min(1),
});

const TYPE_ASK: Record<ShotType, string> = {
  sing: "SING: where the star sings this line (setting, light, outfit)",
  dance: "DANCE: a place with open floor where the star dances",
  scene: "SCENE: the star acting out what the line means (instrumental: an atmospheric shot)",
  lyric: "ART: abstract or illustrated background art for the words, no people and no text",
};

export function buildShotPrompt(req: MusicVideoRequest, shots: PlannedShot[]): string {
  const needsStar = shots.some((s) => s.type !== "lyric");
  return [
    "You are directing a vertical (9:16) music video. Write one shot per segment of the song.",
    `Song: "${req.title}". Genre: ${req.genre}. Mood: ${req.mood || "any"}.`,
    needsStar
      ? req.character
        ? `The star is ${req.character.name}: ${req.character.description}. Set "star" to that description.`
        : 'Invent one lead singer with a fixed visual description (age, look, hair, outfit) in "star", in English.'
      : 'Set "star" to "".',
    req.kidSafe ? "Audience is young children: gentle, bright, safe imagery only." : "",
    req.danceStyle ? `Dance shots are ${DANCE_STYLE_INFO[req.danceStyle].label} dancing.` : "",
    "Shots follow the lyrics' meaning and build visually, in varied settings and camera angles.",
    // No quote marks in the instructions: small models copy them into their JSON strings unescaped.
    "In imagePrompt call the lead the star, without describing their face or outfit. Never depict real singers, celebrities or brands.",
    "Don't use quote marks inside any string.",
    "imagePrompt and motionPrompt are in English. motionPrompt is one short camera and movement direction.",
    `Return exactly ${shots.length} shots, in order.`,
    'Reply with JSON only: {"star":string,"shots":[{"imagePrompt":string,"motionPrompt":string}]}',
    "",
    ...shots.map((s, i) => `Shot ${i + 1} (${s.start}s-${s.end}s, ${TYPE_ASK[s.type]}): ${s.lines.length ? s.lines.join(" / ") : "(instrumental)"}`),
  ]
    .filter(Boolean)
    .join("\n");
}

// Smaller models sometimes name the list "scenes", or wrap it; one retry covers the rest.
function readPrompts(raw: unknown) {
  const o = (raw ?? {}) as Record<string, unknown>;
  const shots = o.shots ?? o.scenes ?? (Array.isArray(raw) ? raw : undefined);
  return promptsSchema.safeParse({ ...o, shots });
}

export async function writeShotPrompts(llm: LlmProvider, req: MusicVideoRequest, shots: PlannedShot[]) {
  const prompt = buildShotPrompt(req, shots);
  let parsed = readPrompts(await llm.completeJson(prompt));
  if (!parsed.success) parsed = readPrompts(await llm.completeJson(`${prompt}\n\nYour last reply didn't match. Reply with exactly that JSON shape, with a "shots" array.`));
  if (!parsed.success) throw new Error("The shot list came out garbled; try again");
  const out = parsed.data;
  // Models occasionally miscount; reuse the last shot rather than fail the video.
  return { star: out.star.trim(), shots: shots.map((_, i) => out.shots[Math.min(i, out.shots.length - 1)]) };
}

// The picture prompt for one shot: its framing, the scene, the look, and the star's likeness.
export function framePrompt(board: Pick<Storyboard, "star" | "look">, shot: Pick<StoryboardShot, "type" | "imagePrompt">): string {
  const star = board.star?.description ? `The star is ${board.star.description}, exactly as in the reference picture.` : "";
  const framing = shot.type === "sing" ? SINGER_SHOT : shot.type === "dance" ? DANCER_SHOT : shot.type === "lyric" ? LYRIC_ART : "";
  return [shot.imagePrompt, framing, shot.type === "lyric" ? "" : star, board.look.photoUrl && shot.type !== "lyric" ? PHOTO_LIKENESS : "", STYLE_HINTS[board.look.style]]
    .filter(Boolean)
    .join(". ");
}

function frameRefs(board: Pick<Storyboard, "star" | "look">, type: ShotType): string[] {
  if (type === "lyric") return [];
  return [...(board.look.photoUrl ? [board.look.photoUrl] : []), ...(board.star?.image ? [board.star.image] : [])];
}

async function keep(url: string, file: string, fetchFn: typeof fetch): Promise<string> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, await readMedia(url, fetchFn));
  return pathToFileURL(file).href;
}

// Draws one shot's keyframe and keeps it in the video's folder; null when the safety filter
// blocked it twice.
export async function drawFrame(image: ImageProvider, board: Storyboard, i: number, workDir: string, fetchFn: typeof fetch = fetch): Promise<string | null> {
  const shot = board.shots[i];
  const out = await generateKeyframeSafely(image, { prompt: framePrompt(board, shot), referenceImageUrls: frameRefs(board, shot.type) });
  if (!out) return null;
  // A new name each time, so a redrawn picture isn't served from the browser's cache.
  return keep(out.url, path.join(workDir, "frames", `shot-${i}-${Date.now().toString(36)}.jpg`), fetchFn);
}

export async function loadStoryboard(workDir: string): Promise<Storyboard> {
  return JSON.parse(await readFile(path.join(workDir, STORYBOARD_FILE), "utf8"));
}

export async function saveStoryboard(workDir: string, board: Storyboard): Promise<void> {
  await writeFile(path.join(workDir, STORYBOARD_FILE), JSON.stringify(board, null, 2));
}

const MAX_CAPTION_CHARS = 22;

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

// Lines timed against the whole song, moved onto the part of it this video uses.
export function linesInRange(timed: TimedLine[], offset: number, duration: number): TimedLine[] {
  const r = (n: number) => Math.round(n * 100) / 100;
  return timed
    .filter((l) => l.end > offset + 0.3 && l.start < offset + duration - 0.3)
    .map((l) => ({ text: l.text, start: r(Math.max(0, l.start - offset)), end: r(Math.min(duration, l.end - offset)) }));
}

function songIn(workDir: string) {
  return path.join(workDir, "song.wav");
}

// Step one (free): time the lyrics, find the beat, plan the shots and draw their pictures.
export async function makeStoryboard(
  deps: MusicVideoDeps,
  req: MusicVideoRequest,
  workDir: string,
  onStage: (stage: MusicVideoStage) => Promise<void> | void = () => {},
): Promise<Storyboard> {
  for (const p of [deps.llm, deps.image, deps.stills, deps.whisper]) if (p) assertCommercialSafe(p.modelId);
  const fetchFn = deps.fetchFn ?? fetch;
  const runFfmpeg = deps.runFfmpeg ?? defaultFfmpeg;
  const probe = deps.probeDuration ?? probeDuration;
  await mkdir(workDir, { recursive: true });
  const full = path.join(workDir, `full${path.extname(req.songFile) || ".wav"}`);
  await copyFile(req.songFile, full);

  await onStage("timing");
  const fullSec = await probe(full);
  const offset = Math.max(0, Math.min(req.range?.start ?? 0, fullSec - 1));
  const end = Math.min(fullSec, req.range?.end ?? fullSec);
  const duration = Math.round((end - offset) * 100) / 100;
  if (duration < 3) throw new Error("Pick at least 3 seconds of the song");
  // The part of the song this video uses, decoded once (fal's FLAC-in-.wav songs included).
  await runFfmpeg(["-y", "-ss", String(offset), "-t", String(duration), "-i", full, "-vn", "-ac", "2", "-ar", "44100", songIn(workDir)]);
  let words: Word[] = [];
  if (deps.whisper) {
    try {
      words = await deps.whisper.words(await readMedia(`file://${full}`));
    } catch (err) {
      console.error("Lyric timing fell back to even spacing:", (err as Error).message);
    }
  }
  const timed = linesInRange(timeLines(singableLines(req.lyrics), words, fullSec), offset, duration);

  await onStage("beats");
  let grid: BeatGrid;
  try {
    const pcm = path.join(workDir, "song.f32");
    await runFfmpeg(pcmArgs(songIn(workDir), pcm));
    grid = detectBeats(await readPcm(pcm), duration, req.bpm);
  } catch (err) {
    console.error("Beat detection fell back to an even grid:", (err as Error).message);
    grid = evenGrid(duration, req.bpm);
  }

  await onStage("scenes");
  const planned = planShots(req.kind, duration, grid, timed);
  const prompts = await writeShotPrompts(deps.llm, req, planned);
  const board: Storyboard = {
    kind: req.kind,
    title: req.title,
    duration,
    offset,
    bpm: grid.bpm,
    downbeats: grid.downbeats,
    timed,
    ...(req.kind === "lyric" ? {} : { star: { description: req.character?.description ?? (prompts.star || "a charismatic young Indian singer") } }),
    look: { style: req.style, photoUrl: req.photoUrl, kidSafe: req.kidSafe, danceStyle: req.danceStyle },
    shots: planned.map((s, i) => ({ ...s, ...prompts.shots[i] })),
    redraws: 0,
  };

  await onStage("keyframes");
  if (board.star) {
    // One picture of the star that every shot is drawn from, so it's the same person throughout.
    const refs = [...(req.photoUrl ? [req.photoUrl] : []), ...(req.character ? [req.character.referenceImageUrl] : [])];
    const prompt = [
      `Full-body portrait of ${board.star.description}, standing and facing the camera, clear face, plain softly lit background`,
      req.photoUrl ? PHOTO_LIKENESS : "",
      STYLE_HINTS[req.style],
    ]
      .filter(Boolean)
      .join(". ");
    const star = await generateKeyframeSafely(deps.image, { prompt, referenceImageUrls: refs, seed: req.character?.seed });
    if (star) board.star.image = await keep(star.url, path.join(workDir, "frames", "star.jpg"), fetchFn);
  }
  const frames = fillBlockedFrames(await mapLimit(board.shots, 3, (_, i) => drawFrame(deps.image, board, i, workDir, fetchFn)));
  board.shots.forEach((s, i) => (s.frame = frames[i]));
  await saveStoryboard(workDir, board);
  return board;
}

async function referenceClip(req: MusicVideoRequest, assetsDir: string | undefined): Promise<string> {
  return req.danceClipFile ?? libraryClip(req.danceStyle ?? "bollywood", assetsDir);
}

// Step two (paid): animate every shot with its model and cut it all to the song.
export async function renderMusicVideo(
  deps: MusicVideoDeps,
  req: MusicVideoRequest,
  workDir: string,
  onStage: (stage: MusicVideoStage) => Promise<void> | void = () => {},
): Promise<{ output: string; title: string }> {
  const board = await loadStoryboard(workDir);
  const types = new Set(board.shots.map((s) => s.type));
  const needsAv = types.has("sing") || types.has("dance") || types.has("scene");
  if (needsAv && !deps.av) throw new Error("AI music videos aren't set up on this server");
  for (const p of [deps.image, deps.stills, ...(needsAv && deps.av ? [deps.av.singer, deps.av.dancer, deps.av.scenes, deps.av.stems] : [])]) {
    assertCommercialSafe(p.modelId);
  }
  const fetchFn = deps.fetchFn ?? fetch;
  const runFfmpeg = deps.runFfmpeg ?? defaultFfmpeg;
  const song = songIn(workDir);

  // Shots the creator changed in the storyboard are drawn now.
  if (board.shots.some((s) => !s.frame)) {
    await onStage("keyframes");
    const drawn = await mapLimit(board.shots, 3, async (s, i) => s.frame ?? (await drawFrame(deps.image, board, i, workDir, fetchFn)) ?? null);
    fillBlockedFrames(drawn).forEach((f, i) => (board.shots[i].frame = f));
    await saveStoryboard(workDir, board);
  }

  // Singing shots lip-sync to the singer's voice alone, which is far cleaner than the full mix.
  let vocals: string | undefined;
  if (types.has("sing") && deps.av) {
    await onStage("stems");
    const mp3 = path.join(workDir, "song.mp3");
    await runFfmpeg(["-y", "-i", song, "-b:a", "192k", mp3]);
    try {
      const stems = await deps.av.stems.separate(`data:audio/mpeg;base64,${(await readFile(mp3)).toString("base64")}`);
      vocals = path.join(workDir, "vocals.wav");
      await writeFile(vocals, await readMedia(stems.vocalsUrl, fetchFn));
    } catch (err) {
      console.error("Vocal separation failed; singing to the full mix:", (err as Error).message);
      vocals = song;
    }
  }

  await onStage("clips");
  const reference = types.has("dance") ? await referenceClip(req, deps.assetsDir) : undefined;
  let failed = 0;
  const clips = await mapLimit(board.shots, 3, async (shot, i) => {
    const seconds = Math.round((shot.end - shot.start) * 100) / 100;
    const frame = shot.frame!;
    const file = path.join(workDir, `clip-${i}.mp4`);
    const still = () => deps.stills.animate({ imageUrl: frame, prompt: shot.motionPrompt, durationSec: seconds, resolution: req.resolution });
    let clip: { url: string };
    try {
      if (shot.type === "lyric" || !deps.av) clip = await still();
      else if (shot.type === "sing") {
        const audio = path.join(workDir, `sing-${i}.mp3`);
        await runFfmpeg(["-y", "-ss", String(shot.start), "-t", String(seconds), "-i", vocals ?? song, "-vn", "-ac", "2", "-ar", "44100", "-b:a", "160k", audio]);
        clip = await deps.av.singer.sing({ imageUrl: frame, audioUrl: pathToFileURL(audio).href, prompt: `${shot.motionPrompt}; ${SINGER_SHOT}, singing with feeling` });
      } else if (shot.type === "dance") {
        const ref = path.join(workDir, `dance-ref-${i}.mp4`);
        await runFfmpeg(referenceClipArgs(reference!, seconds, ref));
        const moves = DANCE_STYLE_INFO[board.look.danceStyle ?? "bollywood"].moves;
        clip = await deps.av.dancer.dance({ imageUrl: frame, referenceUrl: pathToFileURL(ref).href, prompt: `The star dances ${moves}. ${shot.motionPrompt}`, starUrl: board.star?.image });
      } else {
        clip = await deps.av.scenes.animate({ imageUrl: frame, prompt: shot.motionPrompt, durationSec: seconds, starUrl: board.star?.image });
      }
    } catch (err) {
      if (shot.type === "lyric" || !deps.av) throw err;
      // One failed shot shouldn't sink the video: it becomes a moving still instead.
      console.error(`Music video shot ${i} (${shot.type}) failed; using a moving still:`, (err as Error).message);
      failed++;
      clip = await still();
    }
    await writeFile(file, await readMedia(clip.url, fetchFn));
    return file;
  });
  if (failed > board.shots.length / 2) throw new Error("Too many shots of this music video failed to animate");

  await onStage("assemble");
  const fontsDir = path.resolve(/*turbopackIgnore: true*/ deps.fontsDir ?? "assets/fonts");
  const captions =
    req.captions === false
      ? undefined
      : board.kind === "lyric"
        ? await renderBigLyrics(lyricCues(board.timed), req.resolution, fontsDir, workDir)
        : await renderCaptionImages(lyricCues(board.timed), req.resolution, fontsDir, workDir);
  const output = path.join(workDir, "film.mp4");
  await runFfmpeg(
    buildMusicVideoCutArgs({
      clips,
      durations: board.shots.map((s) => Math.round((s.end - s.start) * 100) / 100),
      song,
      resolution: req.resolution,
      watermark: req.watermark,
      output,
      captions,
      flashes: board.kind === "lyric" ? board.downbeats : undefined,
    }),
  );

  await onStage("done");
  return { output, title: req.title };
}

export async function runMusicVideo(
  deps: MusicVideoDeps,
  req: MusicVideoRequest,
  workDir: string,
  onStage: (stage: MusicVideoStage) => Promise<void> | void = () => {},
  phase: MusicVideoPhase = "all",
): Promise<{ output: string | null; title: string }> {
  if (phase !== "render") await makeStoryboard(deps, req, workDir, onStage);
  if (phase === "storyboard") return { output: null, title: req.title };
  return renderMusicVideo(deps, req, workDir, onStage);
}
