import { NextResponse } from "next/server";
import { z } from "zod";
import { loadEnv } from "@/lib/env";
import { buildLlm } from "@/lib/providers";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { getUserId, unauthorized } from "@/lib/session";
import { enhanceLyrics, writeLyrics } from "@/lib/songs/lyrics";
import { lyricsRequestSchema } from "@/lib/songs/request";
import { assertNoRealArtists, SongSafetyError } from "@/lib/songs/safety";
import { findGenre } from "@/lib/songs/styles";

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = lyricsRequestSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const genre = findGenre(parsed.data.genre);
  if (!genre) return NextResponse.json({ error: "Unknown genre" }, { status: 400 });
  if (!(await allow(getRedis(), `ratelimit:lyrics:${userId}`, 40, 24 * 3600))) {
    return NextResponse.json({ error: "Daily limit for AI lyrics reached. Try again tomorrow." }, { status: 429 });
  }
  try {
    const llm = buildLlm(loadEnv());
    const { draft, ...options } = parsed.data;
    await assertNoRealArtists(llm, [options.topic, draft ?? ""]);
    // With the creator's own lines: "Enhance my lyrics" grows them into a full song.
    const out = draft ? await enhanceLyrics(llm, draft, { ...options, genre }) : await writeLyrics(llm, { ...options, genre });
    // The model is told not to name artists; check its output too.
    await assertNoRealArtists(llm, [out.title, out.lyrics]);
    return NextResponse.json(out);
  } catch (err) {
    const status = err instanceof SongSafetyError ? 400 : 502;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
