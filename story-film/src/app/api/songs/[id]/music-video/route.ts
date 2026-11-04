import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { musicVideoCredits } from "@/lib/billing/catalog";
import { grantCredits, spendCredits } from "@/lib/billing/credits";
import { getCharacter } from "@/lib/characters";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { createFilm } from "@/lib/films";
import { cinematicAvailable, premiumAvailable } from "@/lib/providers";
import { resolvePhoto, StartError } from "@/lib/start-film";
import { getFilmQueue, musicVideoRequestSchema } from "@/lib/queue/films";
import { FREE_PLAN } from "@/lib/quota/plans";
import { getUserId, unauthorized } from "@/lib/session";
import { getSong } from "@/lib/songs/songs";
import { findGenre } from "@/lib/songs/styles";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = musicVideoRequestSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const { id } = await params;
  const db = getDb();
  const song = await getSong(db, userId, id).catch(() => undefined);
  if (!song?.outputPath || song.status !== "completed") return NextResponse.json({ error: "Song not found" }, { status: 404 });
  const env = loadEnv();
  const { quality, singer } = parsed.data;
  if (quality === "premium" && !premiumAvailable(env)) {
    return NextResponse.json({ error: "AI animation isn't available yet" }, { status: 400 });
  }
  if (quality === "cinematic" && !cinematicAvailable(env)) {
    return NextResponse.json({ error: "Cinematic videos aren't available yet" }, { status: 400 });
  }
  if (singer && quality === "standard") {
    return NextResponse.json({ error: "Singing it yourself needs AI animation or Cinematic quality." }, { status: 400 });
  }
  let photoUrl: string | undefined;
  try {
    photoUrl = await resolvePhoto({ ...parsed.data, userId }, env.OUTPUT_DIR);
  } catch (err) {
    if (err instanceof StartError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  let character;
  if (parsed.data.characterId) {
    character = await getCharacter(db, userId, parsed.data.characterId);
    if (!character) return NextResponse.json({ error: "Character not found" }, { status: 404 });
  }

  const filmId = randomUUID();
  const credits = musicVideoCredits(quality, song.durationSec, { singer, cinematicModel: env.CINEMATIC_VIDEO_MODEL });
  if (!(await spendCredits(db, userId, credits, filmId))) {
    return NextResponse.json({ error: `This music video needs ${credits} credits.`, needCredits: true }, { status: 402 });
  }
  try {
    await createFilm(db, {
      id: filmId,
      userId,
      songId: song.id,
      characterId: character?.id,
      story: `Music video for "${song.title}"`,
      style: parsed.data.style,
      durationSec: song.durationSec,
      kidSafe: parsed.data.kidSafe,
      quality,
      credits,
      photoConsentAt: photoUrl ? new Date() : undefined,
    });
    await getFilmQueue().add(
      "music-video",
      {
        ...parsed.data,
        userId,
        songId: song.id,
        songFile: song.outputPath,
        title: song.title,
        lyrics: song.lyrics,
        genre: findGenre(song.genre)?.label ?? song.genre,
        mood: song.mood,
        character,
        photoUrl,
        resolution: quality === "cinematic" ? "1080p" : FREE_PLAN.resolution,
        // Paid, so no free-plan watermark (the AI label stays).
        watermark: false,
        credits,
      },
      { jobId: filmId },
    );
    return NextResponse.json({ id: filmId, credits }, { status: 202 });
  } catch (err) {
    await grantCredits(db, userId, credits, "refund", filmId);
    throw err;
  }
}
