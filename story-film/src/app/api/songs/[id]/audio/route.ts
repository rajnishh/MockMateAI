import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { getDb } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/session";
import { getSong } from "@/lib/songs/songs";

const TYPES: Record<string, string> = { ".mp3": "audio/mpeg", ".wav": "audio/wav", ".flac": "audio/flac", ".ogg": "audio/ogg" };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const song = await getSong(getDb(), userId, id).catch(() => undefined);
  if (!song?.outputPath) return new Response("Not found", { status: 404 });
  // The path was written by the worker, never taken from the request.
  const ext = path.extname(song.outputPath);
  const { size } = await stat(song.outputPath);
  const safeTitle = song.title.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "song";
  return new Response(Readable.toWeb(createReadStream(song.outputPath)) as ReadableStream, {
    headers: {
      "Content-Type": TYPES[ext] ?? "application/octet-stream",
      "Content-Length": String(size),
      "Content-Disposition": `inline; filename="song${ext}"; filename*=UTF-8''${encodeURIComponent(safeTitle + ext)}`,
    },
  });
}
