import { mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { getDb } from "@/lib/db";
import { defaultFfmpeg } from "@/lib/ffmpeg";
import { serveFile } from "@/lib/serve-file";
import { getUserId, unauthorized } from "@/lib/session";
import { isSoundPreset, mixArgs, PREVIEW_SEC, previewFile } from "@/lib/songs/mix";
import { getSong } from "@/lib/songs/songs";

// The first 30 seconds of the song with a sound preset, to hear before saving. Rendered once
// (well under a second) and kept next to the song.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const preset = new URL(req.url).searchParams.get("preset") ?? "";
  if (!isSoundPreset(preset)) return new Response("Unknown sound", { status: 400 });
  const song = await getSong(getDb(), userId, id).catch(() => undefined);
  if (!song?.outputPath || song.status !== "completed") return new Response("Not found", { status: 404 });
  // The path is built from the worker-written song path and a known preset id.
  const file = previewFile(song.outputPath, id, preset);
  if (!(await stat(file).catch(() => null))) {
    await mkdir(path.dirname(file), { recursive: true });
    const part = `${file}.${process.pid}.${Date.now()}.mp3`;
    await defaultFfmpeg(mixArgs({ songFile: song.outputPath, preset, output: part, previewSec: PREVIEW_SEC }));
    await rename(part, file);
  }
  return serveFile(req, file, { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" });
}
