import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { getDb } from "@/lib/db";
import { getFilm } from "@/lib/films";
import { getUserId, unauthorized } from "@/lib/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const film = await getFilm(getDb(), userId, id).catch(() => undefined);
  if (!film?.outputPath) return new Response("Not found", { status: 404 });
  // The path was written by the worker, never taken from the request.
  const { size } = await stat(film.outputPath);
  return new Response(Readable.toWeb(createReadStream(film.outputPath)) as ReadableStream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(size),
      "Content-Disposition": `inline; filename="film-${id}.mp4"`,
    },
  });
}
