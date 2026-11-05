import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getRedis } from "@/lib/queue/films";
import { getSongQueue } from "@/lib/queue/songs";
import { allow } from "@/lib/rate-limit";
import { getUserId, unauthorized } from "@/lib/session";
import { changedGains, mixRequestSchema, mixTitle, presetLength, readStemsState, STEMS, stemFile, stemsDir } from "@/lib/songs/mix";
import { createSong, getSong } from "@/lib/songs/songs";

// "Save mix · free": the stems at the creator's levels and/or a sound preset, saved as a new song.
// ffmpeg does it in the worker, so it's free; a daily limit keeps the worker for everyone.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = mixRequestSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const { id } = await params;
  const db = getDb();
  const song = await getSong(db, userId, id).catch(() => undefined);
  if (!song?.outputPath || song.status !== "completed") return NextResponse.json({ error: "Song not found" }, { status: 404 });

  const gains = changedGains(parsed.data.gains);
  if (!gains && !parsed.data.preset) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  const dir = stemsDir(song.outputPath, id);
  if (gains && (await readStemsState(dir)).status !== "ready") return NextResponse.json({ error: "Split the song into parts first" }, { status: 409 });
  if (!(await allow(getRedis(), `ratelimit:song-mix:${userId}`, 60, 24 * 3600))) {
    return NextResponse.json({ error: "Daily limit for mixes reached. Try again tomorrow." }, { status: 429 });
  }

  const songId = randomUUID();
  const title = mixTitle(song.title, parsed.data);
  // Every file path is built from the worker-written song path, never from the request.
  const mix = {
    songFile: song.outputPath,
    ...(gains ? { stems: STEMS.map((s) => ({ file: stemFile(dir, s), gain: gains[s] ?? 1 })) } : {}),
    ...(parsed.data.preset ? { preset: parsed.data.preset } : {}),
  };
  await createSong(db, {
    id: songId,
    userId,
    title,
    genre: song.genre,
    mood: song.mood,
    language: song.language,
    lyrics: song.lyrics,
    durationSec: Math.round(presetLength(parsed.data.preset, song.durationSec)),
    credits: 0,
    parentSongId: song.id,
  });
  await getSongQueue().add("studio", { songId, userId, title, mix, credits: 0 }, { jobId: songId });
  return NextResponse.json({ id: songId }, { status: 202 });
}
