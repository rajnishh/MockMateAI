import path from "node:path";
import { getDb } from "@/lib/db";
import { giftState, publicGift } from "@/lib/gifts";
import { serveFile } from "@/lib/serve-file";

const TYPES: Record<string, string> = { ".mp3": "audio/mpeg", ".wav": "audio/wav", ".flac": "audio/flac", ".ogg": "audio/ogg" };

// The gift's song for anyone with the link, while the sender shares it. Played, not offered as a download.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await publicGift(getDb(), token);
  if (!found || giftState(found) !== "ready" || !found.song.outputPath) return new Response("Not found", { status: 404 });
  // The path was written by the worker, never taken from the request.
  return serveFile(req, found.song.outputPath, {
    "Content-Type": TYPES[path.extname(found.song.outputPath)] ?? "application/octet-stream",
    "Content-Disposition": "inline",
    "Cache-Control": "private, no-store",
  });
}
