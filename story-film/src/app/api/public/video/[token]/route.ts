import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { film } from "@/lib/db/schema";
import { loadEnv } from "@/lib/env";
import { filmIdFromVideoToken } from "@/lib/public-video";
import { tokenKey } from "@/lib/youtube-config";

// Signed, expiring video link for platforms that fetch media themselves (Instagram).
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const filmId = filmIdFromVideoToken(token, tokenKey(loadEnv()));
  if (!filmId) return new Response("Link expired", { status: 404 });
  const [row] = await getDb().select({ outputPath: film.outputPath, status: film.status }).from(film).where(eq(film.id, filmId));
  if (!row?.outputPath || row.status !== "completed") return new Response("Not found", { status: 404 });
  const { size } = await stat(row.outputPath);
  return new Response(Readable.toWeb(createReadStream(row.outputPath)) as ReadableStream, {
    headers: { "Content-Type": "video/mp4", "Content-Length": String(size), "Cache-Control": "private, no-store" },
  });
}
