import path from "node:path";
import { getDb } from "@/lib/db";
import { publicSong, publicState } from "@/lib/listen";
import { serveFile } from "@/lib/serve-file";

const TYPES: Record<string, string> = { ".mp3": "audio/mpeg", ".wav": "audio/wav", ".flac": "audio/flac", ".ogg": "audio/ogg" };

// A public song's audio for anyone, with no cookie (so the lock screen and web player can fetch
// it). 410 once the maker makes it private or it's taken down.
export async function GET(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const found = await publicSong(getDb(), publicId);
  if (!found?.song.outputPath) return new Response("Not found", { status: 404 });
  if (publicState(found.song) !== "public") return new Response("Gone", { status: 410 });
  // The path was written by the worker, never taken from the request.
  return serveFile(req, found.song.outputPath, {
    "Content-Type": TYPES[path.extname(found.song.outputPath)] ?? "application/octet-stream",
    "Content-Disposition": "inline",
    "Cache-Control": "private, max-age=600",
  });
}
