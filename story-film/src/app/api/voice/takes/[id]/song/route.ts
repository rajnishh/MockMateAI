import { randomUUID } from "node:crypto";
import { llmForUser } from "@/lib/ai/engines";
import { NextResponse } from "next/server";
import { z } from "zod";
import { TUNE_SONG_CREDITS } from "@/lib/billing/catalog";
import { grantCredits, spendCredits } from "@/lib/billing/credits";
import { getDb } from "@/lib/db";
import { createReplyGift, giftUrl, replyTarget, replyToSchema } from "@/lib/gifts";
import { loadEnv } from "@/lib/env";
import { songsAvailable } from "@/lib/providers";
import { getSongQueue } from "@/lib/queue/songs";
import { notify } from "@/lib/push";
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
  const body = await req.json();
  const parsed = tuneSongSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const { replyTo, fromName } = replyToSchema.safeParse(body).data ?? {};
  const r = parsed.data;
  const genre = findGenre(r.genre);
  if (!genre) return NextResponse.json({ error: "Unknown genre" }, { status: 400 });
  const durationSec = Math.max(1, Math.round(take.meta.durationSec));

  // The first reply to a gift is free, and its sender's name isn't an artist's.
  const reply = replyTo ? await replyTarget(getDb(), userId, replyTo) : undefined;
  if (reply && "error" in reply) return NextResponse.json({ error: reply.error }, { status: reply.status });
  const llm = await llmForUser(getDb(), env, userId);
  let lyrics = cleanLyrics(r.lyrics);
  try {
    await assertNoRealArtists(llm, [r.title, r.topic, lyrics, r.style ?? ""], reply ? [reply.senderName, fromName ?? ""] : []);
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
  const cost = reply?.free ? 0 : TUNE_SONG_CREDITS;
  const songId = randomUUID();
  if (cost > 0 && !(await spendCredits(db, userId, cost, `song:${songId}`, "song"))) {
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
      credits: cost,
    });
    // The same job as a cover remix; the worker needs nothing new.
    await getSongQueue().add("remix", { songId, userId, title: r.title, call, credits: cost }, { jobId: songId });
    const replyGift = reply ? await createReplyGift(db, { userId, songId, original: reply.original, senderName: reply.senderName, free: reply.free, fromName }) : undefined;
    if (replyGift && reply) notify(db, [reply.original.senderId], { title: `${replyGift.fromName || "Someone"} is making you a song back`, body: "Your gift got a reply. It plays in about a minute.", path: "/inbox" });
    const gift = replyGift ? { token: replyGift.token, url: giftUrl(env.BETTER_AUTH_URL, replyGift.token), free: replyGift.freeReply } : undefined;
    return NextResponse.json({ id: songId, credits: cost, gift }, { status: 202 });
  } catch (err) {
    if (cost > 0) await grantCredits(db, userId, cost, "refund", `song:${songId}`);
    throw err;
  }
}
