import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Phase 0 keeps generated media on local disk under unguessable names.
// Phase 1 swaps this for S3/R2 with signed URLs.
export class LocalMediaStore {
  constructor(readonly dir: string) {}

  async put(data: Buffer, ext: string): Promise<string> {
    await mkdir(this.dir, { recursive: true });
    const file = path.resolve(this.dir, `${randomUUID()}.${ext}`);
    await writeFile(file, data);
    return pathToFileURL(file).href;
  }
}

export const MEDIA_NAME = /^[0-9a-f-]{36}\.(png|jpg|mp4|wav)$/;

// Browser-facing URL for a stored media reference.
export function publicMediaUrl(url: string): string {
  return url.startsWith("file://") ? `/api/media/${path.basename(fileURLToPath(url))}` : url;
}

export async function readMedia(url: string, fetchFn: typeof fetch = fetch): Promise<Buffer> {
  if (url.startsWith("file://")) return readFile(fileURLToPath(url));
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}
