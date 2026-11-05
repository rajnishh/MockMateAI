import { getDb } from "@/lib/db";
import { publicSong, publicState } from "@/lib/listen";
import { serveFile } from "@/lib/serve-file";

// A public song's cover art (always a JPEG, made by the worker).
export async function GET(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const found = await publicSong(getDb(), publicId);
  if (!found?.song.coverPath || publicState(found.song) !== "public") return new Response("Not found", { status: 404 });
  return serveFile(req, found.song.coverPath, { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600" });
}
