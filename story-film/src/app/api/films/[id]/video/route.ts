import { getDb } from "@/lib/db";
import { getFilm } from "@/lib/films";
import { serveFile } from "@/lib/serve-file";
import { getUserId, unauthorized } from "@/lib/session";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const film = await getFilm(getDb(), userId, id).catch(() => undefined);
  if (!film?.outputPath) return new Response("Not found", { status: 404 });
  // The path was written by the worker, never taken from the request.
  return serveFile(req, film.outputPath, { "Content-Type": "video/mp4", "Content-Disposition": `inline; filename="film-${id}.mp4"` });
}
