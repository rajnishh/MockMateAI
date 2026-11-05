import { open } from "node:fs/promises";
import { getDb } from "@/lib/db";
import { giftState, publicGift } from "@/lib/gifts";
import { photoType } from "@/lib/photos";
import { serveFile } from "@/lib/serve-file";

const TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

// The gift's cover: the sender's photo, or the song's AI cover art.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await publicGift(getDb(), token);
  const state = found ? giftState(found) : "removed";
  const file = found?.gift.coverPath ?? found?.song.coverPath;
  if (!found || !file || state === "removed" || state === "taken_down") return new Response("Not found", { status: 404 });
  // Both paths were resolved by the server, never taken from the request.
  const head = Buffer.alloc(16);
  const fh = await open(file).catch(() => undefined);
  if (!fh) return new Response("Not found", { status: 404 });
  await fh.read(head, 0, 16, 0).finally(() => fh.close());
  return serveFile(req, file, { "Content-Type": TYPES[photoType(head) ?? "jpg"], "Cache-Control": "private, max-age=3600" });
}
