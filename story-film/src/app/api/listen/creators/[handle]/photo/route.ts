import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { creatorProfile } from "@/lib/db/schema";
import { loadEnv } from "@/lib/env";
import { HANDLE } from "@/lib/listen";
import { profilePhotoFile } from "@/lib/profile";
import { serveFile } from "@/lib/serve-file";

// A Listen creator's uploaded profile photo, shown next to their songs. Public like song covers:
// only people with a handle (who chose to be on Listen) have one here.
export async function GET(req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const handle = decodeURIComponent((await params).handle).toLowerCase();
  if (!HANDLE.test(handle)) return new Response("Not found", { status: 404 });
  const db = getDb();
  const [row] = await db.select({ userId: creatorProfile.userId }).from(creatorProfile).where(eq(creatorProfile.handle, handle));
  const found = row && (await profilePhotoFile(db, loadEnv().OUTPUT_DIR, row.userId));
  if (!found) return new Response("Not found", { status: 404 });
  return serveFile(req, found.file, { "Content-Type": found.type, "Cache-Control": "public, max-age=3600" });
}
