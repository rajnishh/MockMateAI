import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { SONG_CREDITS } from "@/lib/billing/catalog";
import { grantCredits, spendCredits } from "@/lib/billing/credits";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { buildLlm, songsAvailable } from "@/lib/providers";
import { getSongQueue } from "@/lib/queue/songs";
import { getUserId, unauthorized } from "@/lib/session";
import { cleanLyrics } from "@/lib/songs/lyrics";
import { newSongSchema, vocalLanguage } from "@/lib/songs/request";
import { assertNoRealArtists, SongSafetyError } from "@/lib/songs/safety";
import { createSong, listSongs, songView } from "@/lib/songs/songs";
import { findGenre, stylePrompt } from "@/lib/songs/styles";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  return NextResponse.json({ songs: (await listSongs(getDb(), userId)).map(songView), credits: SONG_CREDITS, available: songsAvailable(loadEnv()) });
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const env = loadEnv();
  if (!songsAvailable(env)) return NextResponse.json({ error: "Song Studio isn't available yet" }, { status: 503 });
  const parsed = newSongSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const genre = findGenre(parsed.data.genre);
  if (!genre) return NextResponse.json({ error: "Unknown genre" }, { status: 400 });
  const lyrics = cleanLyrics(parsed.data.lyrics);

  // User-edited lyrics and titles are checked again before anything is generated.
  try {
    await assertNoRealArtists(buildLlm(env), [parsed.data.topic, parsed.data.title, lyrics]);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: err instanceof SongSafetyError ? 400 : 502 });
  }

  const db = getDb();
  const songId = randomUUID();
  if (!(await spendCredits(db, userId, SONG_CREDITS, `song:${songId}`, "song"))) {
    return NextResponse.json({ error: `A song costs ${SONG_CREDITS} credits.`, needCredits: true }, { status: 402 });
  }
  try {
    const song = await createSong(db, {
      id: songId,
      userId,
      title: parsed.data.title,
      genre: genre.id,
      mood: parsed.data.mood,
      language: parsed.data.language,
      lyrics,
      durationSec: parsed.data.durationSec,
      credits: SONG_CREDITS,
    });
    await getSongQueue().add(
      "song",
      {
        songId,
        userId,
        style: stylePrompt(genre, parsed.data.mood),
        lyrics,
        durationSec: song.durationSec,
        vocalLanguage: vocalLanguage(parsed.data.language),
        credits: SONG_CREDITS,
      },
      { jobId: songId },
    );
    return NextResponse.json({ id: songId }, { status: 202 });
  } catch (err) {
    await grantCredits(db, userId, SONG_CREDITS, "refund", `song:${songId}`);
    throw err;
  }
}
