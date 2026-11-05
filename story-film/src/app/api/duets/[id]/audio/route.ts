import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { song } from "@/lib/db/schema";
import { getDuet, roleOf } from "@/lib/duets";
import { serveFile } from "@/lib/serve-file";
import { getUserId, unauthorized } from "@/lib/session";

// Either part, or the joined song, for the two people in the duet only.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const db = getDb();
  const d = await getDuet(db, (await params).id);
  if (!d || !roleOf(d, userId)) return new Response("Not found", { status: 404 });
  const part = new URL(req.url).searchParams.get("part");
  let file: string | null = part === "a" ? d.partAPath : part === "b" ? d.partBPath : null;
  if (part === "song" && d.songId) {
    const [row] = await db.select({ outputPath: song.outputPath, status: song.status }).from(song).where(eq(song.id, d.songId));
    file = row?.status === "completed" ? row.outputPath : null;
  }
  if (!file) return new Response("Not found", { status: 404 });
  // Paths were written by the server, never taken from the request.
  return serveFile(req, file, { "Content-Type": file.endsWith(".wav") ? "audio/wav" : "audio/mpeg", "Cache-Control": "private, no-store" });
}
