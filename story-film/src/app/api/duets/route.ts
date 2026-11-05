import { NextResponse } from "next/server";
import { z } from "zod";
import { llmForUser } from "@/lib/ai/engines";
import { getDb } from "@/lib/db";
import { duetErrorResponse, duetForSong, duetView, listDuets, songStatusOf, startDuet, startDuetSchema, viewerOf } from "@/lib/duets";
import { loadEnv } from "@/lib/env";
import { songsAvailable } from "@/lib/providers";
import { getUserId, unauthorized } from "@/lib/session";
import { assertNoRealArtists, SongSafetyError } from "@/lib/songs/safety";
import { findGenre } from "@/lib/songs/styles";

// My Jugalbandis (started or joined), or the one behind a song (?song=), for the Collab post.
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const db = getDb();
  const base = loadEnv().BETTER_AUTH_URL;
  const songId = new URL(req.url).searchParams.get("song");
  const rows = songId ? [await duetForSong(db, userId, songId)].filter((d) => d !== undefined) : await listDuets(db, userId);
  const duets = await Promise.all(rows.map(async (d) => duetView(d, viewerOf(d, userId)!, await songStatusOf(db, d), base)));
  return NextResponse.json({ duets });
}

// Start a Jugalbandi: topic, style and language. The price is taken now and comes back if it's cancelled.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const env = loadEnv();
  if (!songsAvailable(env)) return NextResponse.json({ error: "Song Studio isn't available yet" }, { status: 503 });
  const parsed = startDuetSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  if (!findGenre(parsed.data.genre)) return NextResponse.json({ error: "Unknown style" }, { status: 400 });
  const db = getDb();
  try {
    await assertNoRealArtists(await llmForUser(db, env, userId), [parsed.data.topic], [parsed.data.name]);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: err instanceof SongSafetyError ? 400 : 502 });
  }
  try {
    const d = await startDuet(db, userId, parsed.data);
    return NextResponse.json(duetView(d, "a", null, env.BETTER_AUTH_URL), { status: 201 });
  } catch (err) {
    return duetErrorResponse(err);
  }
}
