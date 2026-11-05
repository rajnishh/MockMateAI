import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { REMIX_CREDITS, SONG_CREDITS } from "@/lib/billing/catalog";
import { grantCredits, spendCredits } from "@/lib/billing/credits";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { buildLlm, songsAvailable } from "@/lib/providers";
import { getSongQueue } from "@/lib/queue/songs";
import { getUserId, unauthorized } from "@/lib/session";
import { prepareSong } from "@/lib/songs/create";
import { newSongSchema, songLength, vocalLanguage } from "@/lib/songs/request";
import { assertNoRealArtists, SongSafetyError } from "@/lib/songs/safety";
import { createSong, listSongs, songView, takeCredits } from "@/lib/songs/songs";
import { findGenre } from "@/lib/songs/styles";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  return NextResponse.json({ songs: (await listSongs(getDb(), userId)).map(songView), credits: SONG_CREDITS, remixCredits: REMIX_CREDITS, available: songsAvailable(loadEnv()) });
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

  // Simple mode writes the title, lyrics and style with AI first. User-edited lyrics and titles,
  // and AI-written ones, are checked before anything is generated.
  const llm = buildLlm(env);
  let prepared: Awaited<ReturnType<typeof prepareSong>>;
  try {
    await assertNoRealArtists(llm, [parsed.data.topic, parsed.data.title, parsed.data.lyrics, parsed.data.style ?? ""]);
    prepared = await prepareSong(llm, parsed.data, genre);
    if (parsed.data.mode === "simple") await assertNoRealArtists(llm, [prepared.title, prepared.lyrics, prepared.style]);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: err instanceof SongSafetyError ? 400 : 502 });
  }
  const { lyrics, style, controls } = prepared;

  const db = getDb();
  const { takes } = parsed.data;
  const ids = Array.from({ length: takes }, () => randomUUID());
  // One charge for all takes; each take carries its share, so a failed take refunds only that share.
  const shares = takeCredits(SONG_CREDITS, takes);
  if (!(await spendCredits(db, userId, SONG_CREDITS, `song:${ids[0]}`, "song"))) {
    return NextResponse.json({ error: `A song costs ${SONG_CREDITS} credits.`, needCredits: true }, { status: 402 });
  }
  const { model } = parsed.data;
  const durationSec = songLength(model, parsed.data.durationSec);
  try {
    for (const [i, songId] of ids.entries()) {
      const title = takes > 1 ? `${prepared.title} (v${i + 1})`.slice(0, 80) : prepared.title.slice(0, 80);
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
        { songId, userId, title, style, lyrics, durationSec, vocalLanguage: vocalLanguage(parsed.data.language), credits: shares[i], model, controls },
        { jobId: songId },
      );
    }
    return NextResponse.json({ id: ids[0], ids, title: prepared.title }, { status: 202 });
  } catch (err) {
    // The charge was made under the first take's id; a refund under that id happens at most once.
    await grantCredits(db, userId, SONG_CREDITS, "refund", `song:${ids[0]}`);
    throw err;
  }
}
