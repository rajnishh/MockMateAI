import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { MY_VOICE_CREDITS } from "@/lib/billing/catalog";
import { grantCredits, spendCredits } from "@/lib/billing/credits";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { myVoiceAvailable } from "@/lib/providers";
import { getSongQueue } from "@/lib/queue/songs";
import { getUserId, unauthorized } from "@/lib/session";
import { createSong, getSong } from "@/lib/songs/songs";
import { getVoice } from "@/lib/voice/profiles";

const schema = z.object({ voiceProfileId: z.uuid() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  if (!myVoiceAvailable(loadEnv())) return NextResponse.json({ error: "Voice features aren't set up yet" }, { status: 503 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Pick one of your voices" }, { status: 400 });
  const { id } = await params;
  const db = getDb();
  const song = await getSong(db, userId, id).catch(() => undefined);
  if (!song?.outputPath || song.status !== "completed") return NextResponse.json({ error: "Song not found" }, { status: 404 });
  if (song.voiceProfileId) return NextResponse.json({ error: "This version is already in your voice" }, { status: 400 });
  // Only the account's own consented voices can be used.
  const voice = await getVoice(db, userId, parsed.data.voiceProfileId);
  if (!voice) return NextResponse.json({ error: "Voice not found" }, { status: 404 });

  const songId = randomUUID();
  if (!(await spendCredits(db, userId, MY_VOICE_CREDITS, `song:${songId}`, "song"))) {
    return NextResponse.json({ error: `This costs ${MY_VOICE_CREDITS} credits.`, needCredits: true }, { status: 402 });
  }
  try {
    const title = `${song.title} (${voice.name})`.slice(0, 80);
    await createSong(db, {
      id: songId,
      userId,
      title,
      genre: song.genre,
      mood: song.mood,
      language: song.language,
      lyrics: song.lyrics,
      durationSec: song.durationSec,
      credits: MY_VOICE_CREDITS,
      parentSongId: song.id,
      voiceProfileId: voice.id,
    });
    await getSongQueue().add(
      "my-voice",
      { songId, userId, title, parentSongFile: song.outputPath, sampleFile: voice.samplePath, credits: MY_VOICE_CREDITS },
      { jobId: songId },
    );
    return NextResponse.json({ id: songId }, { status: 202 });
  } catch (err) {
    await grantCredits(db, userId, MY_VOICE_CREDITS, "refund", `song:${songId}`);
    throw err;
  }
}
