import { randomUUID } from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { defaultFfmpeg, probeDuration } from "@/lib/ffmpeg";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { getUserId, unauthorized } from "@/lib/session";
import { editedLength, isNoop, songEditArgs, songEditSchema } from "@/lib/songs/edit";
import { createSong, getSong, songView } from "@/lib/songs/songs";

// Crop, fade and speed: free, quick, and saved as a new song next to the original.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = songEditSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const { id } = await params;
  const db = getDb();
  const song = await getSong(db, userId, id).catch(() => undefined);
  if (!song?.outputPath || song.status !== "completed") return NextResponse.json({ error: "Song not found" }, { status: 404 });
  if (!(await allow(getRedis(), `ratelimit:song-edit:${userId}`, 60, 24 * 3600))) {
    return NextResponse.json({ error: "Daily limit for song edits reached. Try again tomorrow." }, { status: 429 });
  }

  const lengthSec = await probeDuration(song.outputPath);
  if (isNoop(parsed.data, lengthSec)) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  let durationSec: number;
  try {
    durationSec = editedLength(parsed.data, lengthSec);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  const songId = randomUUID();
  // Next to the original, which the worker wrote; nothing in the path comes from the request.
  const outputPath = path.join(path.dirname(song.outputPath), `${songId}.mp3`);
  await defaultFfmpeg(songEditArgs(song.outputPath, outputPath, parsed.data, lengthSec));
  const edited = await createSong(db, {
    id: songId,
    userId,
    title: `${song.title.replace(/ \(edit\)$/, "")} (edit)`.slice(0, 80),
    genre: song.genre,
    mood: song.mood,
    language: song.language,
    lyrics: song.lyrics,
    durationSec: Math.round(durationSec),
    parentSongId: song.id,
    status: "completed",
    outputPath,
    completedAt: new Date(),
  });
  return NextResponse.json(songView(edited), { status: 201 });
}
