import path from "node:path";
import { getDb } from "@/lib/db";
import { PREVIEW_FILE } from "@/lib/edit/preview";
import { loadEnv } from "@/lib/env";
import { getFilm } from "@/lib/films";
import { serveFile } from "@/lib/serve-file";
import { getUserId, unauthorized } from "@/lib/session";

// The small preview copy of an edit's original clip, for the review and fine-tune screens.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const film = await getFilm(getDb(), userId, (await params).id).catch(() => undefined);
  if (!film || film.format !== "edit") return new Response("Not found", { status: 404 });
  // Built from the film id the database returned, never from the request.
  const file = path.resolve(loadEnv().OUTPUT_DIR, film.id, PREVIEW_FILE);
  return serveFile(req, file, { "Content-Type": "video/mp4", "Cache-Control": "private, max-age=3600" }).catch(() => new Response("Not found", { status: 404 }));
}
