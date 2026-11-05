import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { getFilm } from "@/lib/films";
import { FRAME_NAME } from "@/lib/music-video/request";
import { getUserId, unauthorized } from "@/lib/session";

// A storyboard picture. Names are checked strictly, so requests stay in the video's folder.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; filmId: string; name: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id, filmId, name } = await params;
  if (!FRAME_NAME.test(name)) return new Response("Not found", { status: 404 });
  const film = await getFilm(getDb(), userId, filmId).catch(() => undefined);
  if (!film || film.songId !== id) return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(path.join(path.resolve(loadEnv().OUTPUT_DIR, film.id), "frames", name));
    return new Response(new Uint8Array(data), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
