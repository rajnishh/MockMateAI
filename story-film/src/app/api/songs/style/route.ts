import { NextResponse } from "next/server";
import { z } from "zod";
import { loadEnv } from "@/lib/env";
import { buildLlm } from "@/lib/providers";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { getUserId, unauthorized } from "@/lib/session";
import { styleRequestSchema } from "@/lib/songs/request";
import { assertNoRealArtists, SongSafetyError } from "@/lib/songs/safety";
import { writeStyle } from "@/lib/songs/style-writer";
import { findGenre } from "@/lib/songs/styles";

// "✨ Enhance style": free, like writing lyrics with AI.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = styleRequestSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const genre = findGenre(parsed.data.genre);
  if (!genre) return NextResponse.json({ error: "Unknown genre" }, { status: 400 });
  if (!(await allow(getRedis(), `ratelimit:song-style:${userId}`, 60, 24 * 3600))) {
    return NextResponse.json({ error: "Daily limit for AI styles reached. Try again tomorrow." }, { status: 429 });
  }
  try {
    const llm = buildLlm(loadEnv());
    await assertNoRealArtists(llm, [parsed.data.idea, parsed.data.topic]);
    const style = await writeStyle(llm, { ...parsed.data, idea: parsed.data.idea || parsed.data.topic, genre });
    await assertNoRealArtists(llm, [style]);
    return NextResponse.json({ style });
  } catch (err) {
    const status = err instanceof SongSafetyError ? 400 : 502;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
