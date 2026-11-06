import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { countSongPlay, publicSong, publicState } from "@/lib/listen";
import { clientIp, listenerFor, setVisitorCookie } from "@/lib/listen-http";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { getUserId } from "@/lib/session";

// Sent once a listener has heard 10 seconds. One play per listener per song per day counts.
export async function POST(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  if (!(await allow(getRedis(), `ratelimit:song-play:${clientIp(req)}`, 300, 3600))) return new NextResponse(null, { status: 429 });
  const db = getDb();
  const found = await publicSong(db, publicId);
  if (!found || publicState(found.song) !== "public") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { listener, setCookie } = listenerFor(req, await getUserId().catch(() => undefined));
  const counted = await countSongPlay(db, found.song, listener);
  const res = NextResponse.json({ counted });
  setVisitorCookie(res, req, setCookie);
  return res;
}
