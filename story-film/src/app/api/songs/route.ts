import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { REMIX_CREDITS, SONG_CREDITS } from "@/lib/billing/catalog";
import { grantCredits, spendCredits } from "@/lib/billing/credits";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { buildLlm, proRemixAvailable, songsAvailable } from "@/lib/providers";
import { getSongQueue } from "@/lib/queue/songs";
import { getUserId, unauthorized } from "@/lib/session";
import { cleanLyrics } from "@/lib/songs/lyrics";
import { newSongSchema, songLength, vocalLanguage } from "@/lib/songs/request";
import { assertNoRealArtists, SongSafetyError } from "@/lib/songs/safety";
import { remixKinds } from "@/lib/songs/remix";
import { createSong, listSongs, songView, takeCredits } from "@/lib/songs/songs";
import { findGenre, stylePrompt } from "@/lib/songs/styles";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const env = loadEnv();
  return NextResponse.json({
    songs: (await listSongs(getDb(), userId)).map(songView),
    credits: SONG_CREDITS,
    remixCredits: REMIX_CREDITS,
    available: songsAvailable(env),
    // Remix kinds this server can run, and whether covers take a strength (both need Runware for the pro ones).
    remixKinds: remixKinds(proRemixAvailable(env)),
    coverStrength: proRemixAvailable(env),
  });
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
    await assertNoRealArtists(buildLlm(env), [parsed.data.topic, parsed.data.title, lyrics, parsed.data.style ?? ""]);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: err instanceof SongSafetyError ? 400 : 502 });
  }

  const db = getDb();
  const { takes } = parsed.data;
  const ids = Array.from({ length: takes }, () => randomUUID());
  // One charge for all takes; each take carries its share, so a failed take refunds only that share.
  const shares = takeCredits(SONG_CREDITS, takes);
  if (!(await spendCredits(db, userId, SONG_CREDITS, `song:${ids[0]}`, "song"))) {
    return NextResponse.json({ error: `A song costs ${SONG_CREDITS} credits.`, needCredits: true }, { status: 402 });
  }
  const style = stylePrompt(genre, parsed.data.mood, parsed.data.vocal, parsed.data.style);
  const { model } = parsed.data;
  const durationSec = songLength(model, parsed.data.durationSec);
  try {
    for (const [i, songId] of ids.entries()) {
      const title = takes > 1 ? `${parsed.data.title} (v${i + 1})`.slice(0, 80) : parsed.data.title;
      await createSong(db, {
        id: songId,
        userId,
        title,
        genre: genre.id,
        mood: parsed.data.mood,
        language: parsed.data.language,
        lyrics,
        durationSec,
        credits: shares[i],
      });
      await getSongQueue().add(
        "song",
        { songId, userId, title, style, lyrics, durationSec, vocalLanguage: vocalLanguage(parsed.data.language), credits: shares[i], model },
        { jobId: songId },
      );
    }
    return NextResponse.json({ id: ids[0], ids }, { status: 202 });
  } catch (err) {
    // The charge was made under the first take's id; a refund under that id happens at most once.
    await grantCredits(db, userId, SONG_CREDITS, "refund", `song:${ids[0]}`);
    throw err;
  }
}
