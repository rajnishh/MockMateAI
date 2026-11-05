import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { HEARD_KINDS, planSchema } from "./heard";

// A "take" is one recording (or imported file) for "Just hum it", kept on disk next to the
// other media: <OUTPUT_DIR>/voice/<user folder>/<take id>.* and a small JSON note about it.
// No table: the notes are the creator's list of recordings ("My recordings"), kept for 30 days.
export const TAKE_SEC = { min: 1.5, max: 60 };
export const MAX_TAKE_BYTES = 150 * 1024 * 1024;
export const TAKE_ID = /^[0-9a-f-]{36}$/;

export const UPLOAD_AUDIO_TYPES: Record<string, string> = {
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
};
export const UPLOAD_VIDEO_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/3gpp": "3gp" };

export const takeMetaSchema = z.object({
  id: z.string(),
  kind: z.enum(HEARD_KINDS),
  transcript: z.string(),
  durationSec: z.number(),
  // The filmed or imported video, when the take is a video; null for audio.
  videoFile: z.string().nullable(),
  createdAt: z.string(),
  // What Reelkar planned to make from it, so the recording can be picked up again later.
  plan: planSchema.optional(),
});
export type TakeMeta = z.infer<typeof takeMetaSchema>;

export interface TakeFiles {
  dir: string;
  // The upload as it came.
  original: (ext: string) => string;
  // 44.1 kHz stereo MP3 of the sound: what fal remixes and what the mix uses.
  mp3: string;
  // 16 kHz mono WAV for speech-to-text.
  wav16k: string;
  meta: string;
}

// User ids come from Better Auth; hashing keeps any character out of the path.
export function userFolder(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 32);
}

export function takeFiles(outputDir: string, userId: string, takeId: string): TakeFiles {
  if (!TAKE_ID.test(takeId)) throw new Error("Bad take id");
  const dir = path.resolve(outputDir, "voice", userFolder(userId));
  return {
    dir,
    original: (ext) => path.join(dir, `${takeId}-original.${ext}`),
    mp3: path.join(dir, `${takeId}.mp3`),
    wav16k: path.join(dir, `${takeId}-16k.wav`),
    meta: path.join(dir, `${takeId}.json`),
  };
}

export function newTakeId(): string {
  return randomUUID();
}

export function extractArgs(input: string, mp3: string, wav16k: string, maxSec = TAKE_SEC.max): string[] {
  return [
    "-y", "-loglevel", "error",
    "-t", String(maxSec),
    "-i", input,
    "-map", "0:a:0", "-vn", "-ac", "2", "-ar", "44100", "-b:a", "192k", mp3,
    "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", wav16k,
  ];
}

export async function saveTakeMeta(files: TakeFiles, meta: TakeMeta): Promise<void> {
  await mkdir(files.dir, { recursive: true });
  await writeFile(files.meta, JSON.stringify(meta));
}

// Undefined when the take doesn't exist for this user (or has been cleaned up).
export async function loadTake(outputDir: string, userId: string, takeId: string): Promise<{ files: TakeFiles; meta: TakeMeta } | undefined> {
  if (!TAKE_ID.test(takeId)) return undefined;
  const files = takeFiles(outputDir, userId, takeId);
  try {
    return { files, meta: takeMetaSchema.parse(JSON.parse(await readFile(files.meta, "utf8"))) };
  } catch {
    return undefined;
  }
}

export async function removeTakeFiles(files: TakeFiles, ext?: string): Promise<void> {
  await Promise.all([files.mp3, files.wav16k, files.meta, ...(ext ? [files.original(ext)] : [])].map((f) => rm(f, { force: true })));
}

// A month of recordings, at most 50 (about 1 MB a minute each); older ones go when a new one comes in.
export const TAKE_KEEP_MS = 30 * 24 * 3600 * 1000;
export const TAKE_KEEP_COUNT = 50;

export async function sweepOldTakes(dir: string, now = Date.now()): Promise<void> {
  const names = await readdir(dir).catch(() => [] as string[]);
  const files = await Promise.all(names.map(async (name) => ({ name, mtime: (await stat(path.join(dir, name)).catch(() => undefined))?.mtimeMs })));
  const newest = files
    .filter((f) => f.name.endsWith(".json") && f.mtime !== undefined && now - f.mtime <= TAKE_KEEP_MS)
    .sort((a, b) => b.mtime! - a.mtime!)
    .slice(0, TAKE_KEEP_COUNT)
    .map((f) => f.name.slice(0, 36));
  const keep = new Set(newest);
  await Promise.all(
    files.map(async (f) => {
      const recent = f.mtime !== undefined && now - f.mtime <= TAKE_KEEP_MS;
      // A take's files share its id; files without a note are kept only while new (an upload in progress).
      const id = f.name.slice(0, 36);
      const noted = files.some((g) => g.name === `${id}.json`);
      if (!recent || (noted && !keep.has(id))) await rm(path.join(dir, f.name), { force: true });
    }),
  );
}

// The creator's recordings, newest first. A take still being processed (no length yet) isn't listed.
export async function listTakes(outputDir: string, userId: string): Promise<TakeMeta[]> {
  const dir = path.resolve(outputDir, "voice", userFolder(userId));
  const names = (await readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith(".json") && TAKE_ID.test(n.slice(0, -5)));
  const metas = await Promise.all(
    names.map(async (n) => {
      try {
        return takeMetaSchema.parse(JSON.parse(await readFile(path.join(dir, n), "utf8")));
      } catch {
        return undefined;
      }
    }),
  );
  return metas.filter((m): m is TakeMeta => Boolean(m && m.durationSec > 0)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteTake(outputDir: string, userId: string, takeId: string): Promise<void> {
  const { dir } = takeFiles(outputDir, userId, takeId);
  const names = await readdir(dir).catch(() => [] as string[]);
  await Promise.all(names.filter((n) => n.startsWith(takeId)).map((n) => rm(path.join(dir, n), { force: true })));
}
