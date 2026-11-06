import { NextResponse } from "next/server";
import { llmForUser } from "@/lib/ai/engines";
import { getDb } from "@/lib/db";
import { z } from "zod";
import { loadEnv } from "@/lib/env";

import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { getUserId, unauthorized } from "@/lib/session";
import { writeRap } from "@/lib/songs/rap-verse";
import { rapRequestSchema } from "@/lib/songs/request";
import { assertNoRealArtists, SongSafetyError } from "@/lib/songs/safety";
import { findGenre } from "@/lib/songs/styles";

// "✨ Write a rap verse": free, and counted with AI lyrics.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = rapRequestSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const genre = findGenre(parsed.data.genre);
  if (!genre) return NextResponse.json({ error: "Unknown genre" }, { status: 400 });
  if (parsed.data.topic.length < 3 && parsed.data.lyrics.trim().length < 10) {
    return NextResponse.json({ error: "Say what the song is about first, or write some lyrics" }, { status: 400 });
  }
  if (!(await allow(getRedis(), `ratelimit:lyrics:${userId}`, 40, 24 * 3600))) {
    return NextResponse.json({ error: "Daily limit for AI lyrics reached. Try again tomorrow." }, { status: 429 });
  }
  try {
    const llm = await llmForUser(getDb(), loadEnv(), userId);
    await assertNoRealArtists(llm, [parsed.data.topic, parsed.data.lyrics]);
    const bars = await writeRap(llm, { ...parsed.data, genre });
    await assertNoRealArtists(llm, [bars]);
    return NextResponse.json({ bars });
  } catch (err) {
    const status = err instanceof SongSafetyError ? 400 : 502;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
