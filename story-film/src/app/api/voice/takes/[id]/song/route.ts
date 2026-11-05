import { randomUUID } from "node:crypto";
import { llmForUser } from "@/lib/ai/engines";
import { NextResponse } from "next/server";
import { z } from "zod";
import { TUNE_SONG_CREDITS } from "@/lib/billing/catalog";
import { grantCredits, spendCredits } from "@/lib/billing/credits";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { songsAvailable } from "@/lib/providers";
import { getSongQueue } from "@/lib/queue/songs";
import { getUserId, unauthorized } from "@/lib/session";
import { cleanLyrics, writeLyrics } from "@/lib/songs/lyrics";
import { assertNoRealArtists, SongSafetyError } from "@/lib/songs/safety";
import { createSong } from "@/lib/songs/songs";
import { findGenre } from "@/lib/songs/styles";
import { tuneSongCall, tuneSongSchema } from "@/lib/voice-create/hum-song";
import { loadTake } from "@/lib/voice-create/takes";

// "Make it" for a hummed or sung take: a full-band song on the creator's own tune, as long as the take.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const env = loadEnv();
  if (!songsAvailable(env)) return NextResponse.json({ error: "Song Studio isn't available yet" }, { status: 503 });
  const { id } = await params;
  const take = await loadTake(env.OUTPUT_DIR, userId, id);
  if (!take) return NextResponse.json({ error: "That recording has expired. Record it again." }, { status: 404 });
  const parsed = tuneSongSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const r = parsed.data;
  const genre = findGenre(r.genre);
  if (!genre) return NextResponse.json({ error: "Unknown genre" }, { status: 400 });
  const durationSec = Math.max(1, Math.round(take.meta.durationSec));

  const llm = await llmForUser(getDb(), env, userId);
  let lyrics = cleanLyrics(r.lyrics);
  try {
    await assertNoRealArtists(llm, [r.title, r.topic, lyrics, r.style ?? ""]);
    // A hum with a topic gets lyrics written for it, sized to the take.
    if (!lyrics && r.topic.length >= 3) lyrics = (await writeLyrics(llm, { topic: r.topic, genre, mood: r.mood, language: r.language, durationSec })).lyrics;
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: err instanceof SongSafetyError ? 400 : 502 });
  }

  const call = tuneSongCall({
    // Written by the upload route, never taken from the request.
    takeMp3: take.files.mp3,
    kind: r.kind,
    genre,
    mood: r.mood,
    vocal: r.vocal,
    style: r.style,
    language: r.language,
    heardLyrics: take.meta.transcript,
    lyrics,
  });
  const db = getDb();
  const songId = randomUUID();
  if (!(await spendCredits(db, userId, TUNE_SONG_CREDITS, `song:${songId}`, "song"))) {
    return NextResponse.json({ error: `A song on your tune costs ${TUNE_SONG_CREDITS} credits.`, needCredits: true }, { status: 402 });
  }
  try {
    await createSong(db, {
      id: songId,
      userId,
      title: r.title,
      genre: genre.id,
      mood: r.mood,
      language: r.language,
      lyrics: lyrics || "[Instrumental]",
      durationSec,
      credits: TUNE_SONG_CREDITS,
    });
    // The same job as a cover remix; the worker needs nothing new.
    await getSongQueue().add("remix", { songId, userId, title: r.title, call, credits: TUNE_SONG_CREDITS }, { jobId: songId });
    return NextResponse.json({ id: songId, credits: TUNE_SONG_CREDITS }, { status: 202 });
  } catch (err) {
    await grantCredits(db, userId, TUNE_SONG_CREDITS, "refund", `song:${songId}`);
    throw err;
  }
}
