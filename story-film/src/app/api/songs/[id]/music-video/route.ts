import { randomUUID } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { FREE_STORYBOARDS_PER_DAY, LYRIC_VIDEO_CREDITS, MUSIC_VIDEO_CREDITS_PER_5S, musicVideoKindCredits } from "@/lib/billing/catalog";
import { grantCredits, spendCredits } from "@/lib/billing/credits";
import { getCharacter } from "@/lib/characters";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { createFilm } from "@/lib/films";
import { DANCE_STYLE_INFO, uploadedClipPath } from "@/lib/music-video/dance";
import { musicVideoKindAvailable } from "@/lib/music-video/deps";
import { REQUEST_FILE } from "@/lib/music-video/request";
import { DANCE_STYLES, MUSIC_VIDEO_KINDS } from "@/lib/music-video/shots";
import { resolvePhoto, StartError } from "@/lib/start-film";
import { getFilmQueue, getRedis, type MusicVideoJob, musicVideoKind, musicVideoRequestSchema } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { getUserId, unauthorized } from "@/lib/session";
import { getSong } from "@/lib/songs/songs";
import { findGenre } from "@/lib/songs/styles";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

// The four kinds with their prices for this song, so every screen shows the price up front.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const song = await getSong(getDb(), userId, id).catch(() => undefined);
  if (!song) return bad("Song not found", 404);
  const env = loadEnv();
  const seconds = Number(new URL(req.url).searchParams.get("seconds")) || song.durationSec;
  const length = Math.max(3, Math.min(seconds, song.durationSec));
  return NextResponse.json({
    durationSec: song.durationSec,
    kinds: MUSIC_VIDEO_KINDS.map((kind) => ({
      kind,
      available: musicVideoKindAvailable(kind, env),
      credits: musicVideoKindCredits(kind, length),
      // Per 5 s of song, for "about N credits for 30 s" lines; null for the flat-priced lyric video.
      creditsPer5s: kind === "lyric" ? null : MUSIC_VIDEO_CREDITS_PER_5S[kind],
    })),
    lyricCredits: LYRIC_VIDEO_CREDITS,
    danceStyles: DANCE_STYLES.map((s) => ({ id: s, label: DANCE_STYLE_INFO[s].label })),
    freeStoryboardsPerDay: FREE_STORYBOARDS_PER_DAY,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = musicVideoRequestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return bad(z.prettifyError(parsed.error));
  const body = parsed.data;
  const { id } = await params;
  const db = getDb();
  const song = await getSong(db, userId, id).catch(() => undefined);
  if (!song?.outputPath || song.status !== "completed") return bad("Song not found", 404);
  const env = loadEnv();
  const kind = musicVideoKind(body);
  if (!musicVideoKindAvailable(kind, env)) return bad("This kind of music video isn't available yet");
  if (kind === "lyric" && body.photo) return bad("A lyric video has no star; pick Story, Performance or Full to star in it.");

  let photoUrl: string | undefined;
  try {
    photoUrl = await resolvePhoto({ ...body, userId, quality: kind === "lyric" ? "standard" : "premium" }, env.OUTPUT_DIR);
  } catch (err) {
    if (err instanceof StartError) return bad(err.message, err.status);
    throw err;
  }
  let danceClipFile: string | undefined;
  if (body.danceClip && kind === "full") {
    if (!body.danceClipConsent) return bad("Confirm the dance clip is of you, or of someone who agreed to be copied.");
    danceClipFile = uploadedClipPath(env.OUTPUT_DIR, userId, body.danceClip);
    if (!(await access(danceClipFile).then(() => true, () => false))) return bad("Upload your dance clip again.", 404);
  }
  let character;
  if (body.characterId) {
    character = await getCharacter(db, userId, body.characterId);
    if (!character) return bad("Character not found", 404);
  }

  const start = Math.min(body.range?.start ?? 0, Math.max(0, song.durationSec - 3));
  const end = Math.min(body.range?.end ?? song.durationSec, song.durationSec);
  if (end - start < 3) return bad("Pick at least 3 seconds of the song");
  const price = musicVideoKindCredits(kind, end - start);
  // A free storyboard draws real pictures, so they're limited per day (lyric ones cost us nothing).
  if (body.storyboard && kind !== "lyric" && !(await allow(getRedis(), `ratelimit:mv-storyboard:${userId}`, FREE_STORYBOARDS_PER_DAY, 24 * 3600))) {
    return bad(`You've made ${FREE_STORYBOARDS_PER_DAY} storyboards today. Make one of them, or try again tomorrow.`, 429);
  }

  const filmId = randomUUID();
  // A storyboard is free; it's paid for when the creator renders it.
  const credits = body.storyboard ? 0 : price;
  if (credits && !(await spendCredits(db, userId, credits, filmId))) {
    return NextResponse.json({ error: `This music video needs ${credits} credits.`, needCredits: true }, { status: 402 });
  }
  try {
    await createFilm(db, {
      id: filmId,
      userId,
      songId: song.id,
      characterId: character?.id,
      story: `Music video for "${song.title}"`,
      style: body.style,
      durationSec: Math.round(end - start),
      kidSafe: body.kidSafe,
      quality: kind === "lyric" ? "standard" : "premium",
      credits,
      photoConsentAt: photoUrl ? new Date() : undefined,
    });
    const job: MusicVideoJob = {
      ...body,
      kind,
      phase: body.storyboard ? "storyboard" : "all",
      range: { start, end },
      userId,
      songId: song.id,
      songFile: song.outputPath,
      title: song.title,
      lyrics: song.lyrics,
      genre: findGenre(song.genre)?.label ?? song.genre,
      mood: song.mood,
      character,
      photoUrl,
      danceClipFile,
      // OmniHuman sings best at 720p, and every AI shot is cut to the same frame.
      resolution: "720p",
      // Paid, so no free-plan watermark (the AI label stays).
      watermark: false,
      credits,
    };
    // The render step (POST .../music-video/[filmId]) starts from the same request.
    const workDir = path.resolve(env.OUTPUT_DIR, filmId);
    await mkdir(workDir, { recursive: true });
    await writeFile(path.join(workDir, REQUEST_FILE), JSON.stringify(job));
    await getFilmQueue().add("music-video", job, { jobId: filmId });
    return NextResponse.json({ id: filmId, kind, credits: price, storyboard: body.storyboard }, { status: 202 });
  } catch (err) {
    if (credits) await grantCredits(db, userId, credits, "refund", filmId);
    throw err;
  }
}
