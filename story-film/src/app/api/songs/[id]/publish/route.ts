import { NextResponse } from "next/server";
import { z } from "zod";
import { llmForUser } from "@/lib/ai/engines";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { ownListenView, publishSchema, publishSong, unpublishSong } from "@/lib/listen";
import { getUserId, unauthorized } from "@/lib/session";
import { assertNoRealArtists, SongSafetyError } from "@/lib/songs/safety";

// Puts the maker's song on Listen. The usual song safety check runs again on the title and
// lyrics; if it fails or can't run, the song stays private.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const parsed = publishSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const db = getDb();
  const env = loadEnv();
  try {
    const r = await publishSong(db, userId, id, parsed.data, async (texts) => assertNoRealArtists(await llmForUser(db, env, userId), texts));
    if ("error" in r) return NextResponse.json(r, { status: r.status });
    return NextResponse.json(ownListenView(env.BETTER_AUTH_URL, r.song));
  } catch (err) {
    if (err instanceof SongSafetyError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("publish check failed", err);
    return NextResponse.json({ error: "We couldn't check this song just now, so it's still private. Try again in a minute." }, { status: 502 });
  }
}

// Makes it private again.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const s = await unpublishSong(getDb(), userId, id).catch(() => undefined);
  if (!s) return NextResponse.json({ error: "Song not found" }, { status: 404 });
  return NextResponse.json(ownListenView(loadEnv().BETTER_AUTH_URL, s));
}
