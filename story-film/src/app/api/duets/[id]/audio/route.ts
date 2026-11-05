import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { song } from "@/lib/db/schema";
import { getDuet, viewerOf } from "@/lib/duets";
import { serveFile } from "@/lib/serve-file";
import { getUserId, unauthorized } from "@/lib/session";

// Either part, or the joined song, for the two people in the duet only.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const db = getDb();
  const d = await getDuet(db, (await params).id);
  const viewer = d ? viewerOf(d, userId) : null;
  const part = new URL(req.url).searchParams.get("part");
  // Someone invited by username hears only the first part, as on the invite page.
  if (!d || !viewer || (viewer === "invited" && part !== "a")) return new Response("Not found", { status: 404 });
  let file: string | null = part === "a" ? d.partAPath : part === "b" ? d.partBPath : null;
  if (part === "song" && d.songId) {
    const [row] = await db.select({ outputPath: song.outputPath, status: song.status }).from(song).where(eq(song.id, d.songId));
    file = row?.status === "completed" ? row.outputPath : null;
  }
  if (!file) return new Response("Not found", { status: 404 });
  // Paths were written by the server, never taken from the request.
  return serveFile(req, file, { "Content-Type": file.endsWith(".wav") ? "audio/wav" : "audio/mpeg", "Cache-Control": "private, no-store" });
}
