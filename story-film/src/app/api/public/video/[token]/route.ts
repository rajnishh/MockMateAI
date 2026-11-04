import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { film } from "@/lib/db/schema";
import { loadEnv } from "@/lib/env";
import { filmIdFromVideoToken } from "@/lib/public-video";
import { serveFile } from "@/lib/serve-file";
import { tokenKey } from "@/lib/youtube-config";

// Signed, expiring video link for platforms that fetch media themselves (Instagram).
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const filmId = filmIdFromVideoToken(token, tokenKey(loadEnv()));
  if (!filmId) return new Response("Link expired", { status: 404 });
  const [row] = await getDb().select({ outputPath: film.outputPath, status: film.status }).from(film).where(eq(film.id, filmId));
  if (!row?.outputPath || row.status !== "completed") return new Response("Not found", { status: 404 });
  return serveFile(req, row.outputPath, { "Content-Type": "video/mp4", "Cache-Control": "private, no-store" });
}
