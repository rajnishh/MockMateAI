import { loadEnv } from "@/lib/env";
import { serveFile } from "@/lib/serve-file";
import { getUserId, unauthorized } from "@/lib/session";
import { loadTake } from "@/lib/voice-create/takes";

// Plays one of "My recordings": the take's MP3 (a filmed clip's sound, for videos).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const take = await loadTake(loadEnv().OUTPUT_DIR, userId, (await params).id);
  if (!take) return new Response("Not found", { status: 404 });
  // The path comes from takeFiles, never from the request.
  return serveFile(req, take.files.mp3, { "Content-Type": "audio/mpeg", "Content-Disposition": 'inline; filename="recording.mp3"' }).catch(() => new Response("Not found", { status: 404 }));
}
