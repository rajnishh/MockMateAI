import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { NextResponse } from "next/server";
import { z } from "zod";
import { grantCredits, spendCredits } from "@/lib/billing/credits";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { buildLlm, proRemixAvailable, songsAvailable } from "@/lib/providers";
import { getSongQueue } from "@/lib/queue/songs";
import { getUserId, unauthorized } from "@/lib/session";
import { cleanLyrics } from "@/lib/songs/lyrics";
import { remixCall, remixCredits, remixedDurationSec, remixKinds, remixSchemaFor, type RemixKind } from "@/lib/songs/remix";
import { assertNoRealArtists, SongSafetyError } from "@/lib/songs/safety";
import { createSong, getSong } from "@/lib/songs/songs";
import { findGenre, GENRES, stylePrompt } from "@/lib/songs/styles";

const SUFFIX: Record<RemixKind, string> = { cover: "cover", extend: "extended", replace: "new part", rap: "rap", "add-vocals": "with vocals", "add-instrumental": "new music" };

// Remix a finished song like Suno: a cover in another style, a longer version, or one part redone.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const env = loadEnv();
  if (!songsAvailable(env)) return NextResponse.json({ error: "Song Studio isn't available yet" }, { status: 503 });
  const { id } = await params;
  const db = getDb();
  const song = await getSong(db, userId, id).catch(() => undefined);
  if (!song?.outputPath || song.status !== "completed") return NextResponse.json({ error: "Song not found" }, { status: 404 });
  const parsed = remixSchemaFor(song.durationSec).safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const request = { ...parsed.data, lyrics: parsed.data.lyrics && cleanLyrics(parsed.data.lyrics) };
  if (!remixKinds(proRemixAvailable(env)).includes(request.kind)) {
    return NextResponse.json({ error: "This remix isn't available yet" }, { status: 503 });
  }

  try {
    await assertNoRealArtists(buildLlm(env), [request.style ?? "", request.lyrics ?? ""]);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: err instanceof SongSafetyError ? 400 : 502 });
  }

  // The song table keeps the genre and mood, not the exact style text, so the original style is rebuilt from them.
  const call = remixCall(request, {
    // Written by the worker, never taken from the request.
    audioUrl: pathToFileURL(song.outputPath).href,
    style: stylePrompt(findGenre(song.genre) ?? GENRES[0], song.mood),
    lyrics: song.lyrics,
    durationSec: song.durationSec,
  });
  const credits = remixCredits(request.kind);
  const songId = randomUUID();
  if (!(await spendCredits(db, userId, credits, `song:${songId}`, "song"))) {
    return NextResponse.json({ error: `This costs ${credits} credits.`, needCredits: true }, { status: 402 });
  }
  try {
    const title = `${song.title} (${SUFFIX[request.kind] ?? request.kind})`.slice(0, 80);
    await createSong(db, {
      id: songId,
      userId,
      title,
      genre: song.genre,
      mood: song.mood,
      language: song.language,
      lyrics: request.lyrics ?? song.lyrics,
      durationSec: remixedDurationSec(request, song.durationSec),
      credits,
      parentSongId: song.id,
    });
    await getSongQueue().add("remix", { songId, userId, title, call, credits }, { jobId: songId });
    return NextResponse.json({ id: songId }, { status: 202 });
  } catch (err) {
    await grantCredits(db, userId, credits, "refund", `song:${songId}`);
    throw err;
  }
}
