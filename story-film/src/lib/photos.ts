import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// A creator's own photo for Cinematic and AI-animated reels, kept in a folder per user so a reel
// can only use photos its creator uploaded.
export const PHOTO_ID = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

// The file type from its first bytes, not from what the browser claims.
export function photoType(data: Buffer): "jpg" | "png" | "webp" | undefined {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpg";
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (data.subarray(0, 4).toString("latin1") === "RIFF" && data.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return undefined;
}

function userDir(outputDir: string, userId: string): string {
  return path.resolve(outputDir, "photos", createHash("sha256").update(userId).digest("hex").slice(0, 32));
}

export async function savePhoto(outputDir: string, userId: string, data: Buffer): Promise<string | undefined> {
  const ext = photoType(data);
  if (!ext) return undefined;
  const dir = userDir(outputDir, userId);
  await mkdir(dir, { recursive: true });
  const id = `${randomUUID()}.${ext}`;
  await writeFile(path.join(dir, id), data);
  return id;
}

// Removes every photo a user uploaded; runs when they delete their account.
export async function deletePhotos(outputDir: string, userId: string): Promise<void> {
  await rm(userDir(outputDir, userId), { recursive: true, force: true });
}

// The photo's file URL for the pipeline, or undefined when this user has no such photo.
export async function photoUrl(outputDir: string, userId: string, id: string): Promise<string | undefined> {
  if (!PHOTO_ID.test(id)) return undefined;
  const file = path.join(userDir(outputDir, userId), id);
  try {
    await access(file);
    return pathToFileURL(file).href;
  } catch {
    return undefined;
  }
}
