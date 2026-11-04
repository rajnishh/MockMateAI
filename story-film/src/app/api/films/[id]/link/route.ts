import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { getFilm } from "@/lib/films";
import { PUBLIC_VIDEO_TTL_SEC, publicVideoUrl } from "@/lib/public-video";
import { getUserId, unauthorized } from "@/lib/session";

// A link to the finished video that opens without signing in, for sharing, saving and copying.
// Same signed link Instagram downloads from, so it stops working after a couple of hours.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const film = await getFilm(getDb(), userId, id).catch(() => undefined);
  if (film?.status !== "completed" || !film.outputPath) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const env = loadEnv();
  if (!env.TOKEN_ENCRYPTION_KEY) return NextResponse.json({ error: "Sharing links aren't set up on this server" }, { status: 503 });
  return NextResponse.json({ url: publicVideoUrl(env.BETTER_AUTH_URL, env.TOKEN_ENCRYPTION_KEY, film.id), expiresInSec: PUBLIC_VIDEO_TTL_SEC });
}
