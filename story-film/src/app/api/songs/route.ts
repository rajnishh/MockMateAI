import { randomUUID } from "node:crypto";
import { llmForUser } from "@/lib/ai/engines";
import { NextResponse } from "next/server";
import { z } from "zod";
import { REMIX_CREDITS, SONG_CREDITS, STEMS_CREDITS } from "@/lib/billing/catalog";
import { grantCredits, spendCredits } from "@/lib/billing/credits";
import { getDb } from "@/lib/db";
import { createReplyGift, giftUrl, replyTarget, replyToSchema } from "@/lib/gifts";
import { loadEnv } from "@/lib/env";
import { proRemixAvailable, songsAvailable } from "@/lib/providers";
import { getSongQueue } from "@/lib/queue/songs";
import { getUserId, unauthorized } from "@/lib/session";
import { prepareSong } from "@/lib/songs/create";
import { SOUND_PRESETS } from "@/lib/songs/mix";
import { newSongSchema, songLength, vocalLanguage } from "@/lib/songs/request";
import { assertNoRealArtists, SongSafetyError } from "@/lib/songs/safety";
import { remixKindList } from "@/lib/songs/remix";
import { createSong, listSongs, songView, takeCredits } from "@/lib/songs/songs";
import { findGenre } from "@/lib/songs/styles";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const env = loadEnv();
  return NextResponse.json({
    songs: (await listSongs(getDb(), userId)).map(songView),
    credits: SONG_CREDITS,
    remixCredits: REMIX_CREDITS,
    // Remix kinds this server can run, with the fields each takes; the pro ones need Runware.
    remixKinds: remixKindList(proRemixAvailable(env)),
    soundPresets: SOUND_PRESETS,
    stemsCredits: STEMS_CREDITS,
    available: songsAvailable(env),
  });
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const env = loadEnv();
  if (!songsAvailable(env)) return NextResponse.json({ error: "Song Studio isn't available yet" }, { status: 503 });
  const body = await req.json();
  const parsed = newSongSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const { replyTo, fromName } = replyToSchema.safeParse(body).data ?? {};
  const genre = findGenre(parsed.data.genre);
  if (!genre) return NextResponse.json({ error: "Unknown genre" }, { status: 400 });

  // A reply to a gift is one song, and the first reply to each gift is free.
  const reply = replyTo ? await replyTarget(getDb(), userId, replyTo) : undefined;
  if (reply && "error" in reply) return NextResponse.json({ error: reply.error }, { status: reply.status });
  // A reply names the two people ("a thank-you song for Rajnish, from Priya"); they aren't artists.
  const people = reply ? [reply.senderName, fromName ?? ""] : [];

  // Simple mode writes the title, lyrics and style with AI first. User-edited lyrics and titles,
  // and AI-written ones, are checked before anything is generated.
  const llm = await llmForUser(getDb(), env, userId);
  let prepared: Awaited<ReturnType<typeof prepareSong>>;
  try {
    await assertNoRealArtists(llm, [parsed.data.topic, parsed.data.title, parsed.data.lyrics, parsed.data.style ?? ""], people);
    prepared = await prepareSong(llm, parsed.data, genre);
    if (parsed.data.mode === "simple") await assertNoRealArtists(llm, [prepared.title, prepared.lyrics, prepared.style], people);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: err instanceof SongSafetyError ? 400 : 502 });
  }
  const { lyrics, style, controls } = prepared;

  const db = getDb();
  const cost = reply?.free ? 0 : SONG_CREDITS;
  const takes = reply ? 1 : parsed.data.takes;
  const ids = Array.from({ length: takes }, () => randomUUID());
  // One charge for all takes; each take carries its share, so a failed take refunds only that share.
  const shares = takeCredits(cost, takes);
  if (cost > 0 && !(await spendCredits(db, userId, cost, `song:${ids[0]}`, "song"))) {
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
    const replyGift = reply ? await createReplyGift(db, { userId, songId: ids[0], original: reply.original, senderName: reply.senderName, free: reply.free, fromName }) : undefined;
    const gift = replyGift ? { token: replyGift.token, url: giftUrl(env.BETTER_AUTH_URL, replyGift.token), free: replyGift.freeReply } : undefined;
    return NextResponse.json({ id: ids[0], ids, title: prepared.title, gift }, { status: 202 });
  } catch (err) {
    // The charge was made under the first take's id; a refund under that id happens at most once.
    if (cost > 0) await grantCredits(db, userId, cost, "refund", `song:${ids[0]}`);
    throw err;
  }
}
