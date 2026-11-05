import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { defaultFfmpeg, probeDuration } from "@/lib/ffmpeg";
import { createFilm, filmView, updateFilm } from "@/lib/films";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { getUserId, unauthorized } from "@/lib/session";
import { createSong, getSong, songView } from "@/lib/songs/songs";
import { mixAudioArgs, mixLength, mixSchema, mixVideoArgs } from "@/lib/voice-create/mix";
import { loadTake } from "@/lib/voice-create/takes";

// "Mix": the creator's take with (or without) an AI song: trim, fades, voice and music levels.
// An audio take comes back as a new song; a filmed clip as a new reel. Free, like song edits.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = mixSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const m = parsed.data;
  const env = loadEnv();
  const take = await loadTake(env.OUTPUT_DIR, userId, m.takeId);
  if (!take) return NextResponse.json({ error: "That recording has expired. Record it again." }, { status: 404 });
  const db = getDb();
  const song = m.songId ? await getSong(db, userId, m.songId).catch(() => undefined) : undefined;
  if (m.songId && (!song?.outputPath || song.status !== "completed")) return NextResponse.json({ error: "Song not found" }, { status: 404 });
  if (!(await allow(getRedis(), `ratelimit:voice-mix:${userId}`, 60, 24 * 3600))) {
    return NextResponse.json({ error: "Daily limit for mixes reached. Try again tomorrow." }, { status: 429 });
  }

  const video = take.meta.videoFile;
  const songFile = song?.outputPath ?? undefined;
  let lengthSec: number;
  try {
    lengthSec = mixLength(m, take.meta.durationSec, songFile ? await probeDuration(songFile) : undefined, Boolean(video));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  const id = randomUUID();
  const title = song ? `${song.title.replace(/ \(mix\)$/, "")} (mix)`.slice(0, 80) : "My recording";

  if (video) {
    const dir = path.resolve(env.OUTPUT_DIR, "uploads");
    await mkdir(dir, { recursive: true });
    const outputPath = path.join(dir, `${id}-mix.mp4`);
    const film = await createFilm(db, {
      id,
      userId,
      songId: song?.id,
      story: song ? `My clip with "${song.title}"` : "My clip",
      title,
      style: "animated",
      format: "edit",
      durationSec: Math.ceil(lengthSec),
      status: "running",
    });
    try {
      await defaultFfmpeg(mixVideoArgs(m, video, take.files.mp3, songFile, outputPath, lengthSec));
    } catch (err) {
      await updateFilm(db, id, { status: "failed", error: "We couldn't mix that clip." });
      throw err;
    }
    await updateFilm(db, id, { status: "completed", stage: "done", outputPath, completedAt: new Date() });
    return NextResponse.json({ film: filmView({ ...film, status: "completed", outputPath }) }, { status: 201 });
  }

  // Next to the songs the worker writes; nothing in the path comes from the request.
  const dir = path.resolve(env.OUTPUT_DIR, "songs");
  await mkdir(dir, { recursive: true });
  const outputPath = path.join(dir, `${id}.mp3`);
  await defaultFfmpeg(mixAudioArgs(m, take.files.mp3, songFile, outputPath, lengthSec));
  const mixed = await createSong(db, {
    id,
    userId,
    title,
    genre: song?.genre ?? "pop",
    mood: song?.mood ?? "",
    language: song?.language ?? "hi",
    lyrics: song?.lyrics ?? (take.meta.transcript || "[Instrumental]"),
    durationSec: Math.round(lengthSec),
    parentSongId: song?.id,
    status: "completed",
    outputPath,
    completedAt: new Date(),
  });
  return NextResponse.json({ song: songView(mixed) }, { status: 201 });
}
