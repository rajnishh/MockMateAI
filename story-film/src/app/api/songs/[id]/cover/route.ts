import { getDb } from "@/lib/db";
import { serveFile } from "@/lib/serve-file";
import { getUserId, unauthorized } from "@/lib/session";
import { getSong } from "@/lib/songs/songs";

// The song's square AI cover art (a JPEG the worker made after the song).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const song = await getSong(getDb(), userId, id).catch(() => undefined);
  if (!song?.coverPath) return new Response("Not found", { status: 404 });
  // The path was written by the worker, never taken from the request. A new song gets a new id, so it can be cached.
  return serveFile(req, song.coverPath, { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" });
}
