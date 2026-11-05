import { getDb } from "@/lib/db";
import { serveFile } from "@/lib/serve-file";
import { getUserId, unauthorized } from "@/lib/session";
import { readStemsState, STEM_LABELS, STEMS, type StemName, stemFile, stemsDir } from "@/lib/songs/mix";
import { getSong } from "@/lib/songs/songs";

// One stem of a song, for the mixer and for downloading.
export async function GET(req: Request, { params }: { params: Promise<{ id: string; stem: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id, stem } = await params;
  if (!(STEMS as readonly string[]).includes(stem)) return new Response("Not found", { status: 404 });
  const song = await getSong(getDb(), userId, id).catch(() => undefined);
  if (!song?.outputPath) return new Response("Not found", { status: 404 });
  const dir = stemsDir(song.outputPath, id);
  if ((await readStemsState(dir)).status !== "ready") return new Response("Not found", { status: 404 });
  const safeTitle = song.title.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "song";
  const name = `${safeTitle} - ${STEM_LABELS[stem as StemName]}.mp3`;
  return serveFile(req, stemFile(dir, stem as StemName), {
    "Content-Type": "audio/mpeg",
    "Content-Disposition": `inline; filename="${stem}.mp3"; filename*=UTF-8''${encodeURIComponent(name)}`,
  });
}
