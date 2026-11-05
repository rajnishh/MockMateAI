import { NextResponse } from "next/server";
import { llmForUser } from "@/lib/ai/engines";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";

import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { getUserId, unauthorized } from "@/lib/session";
import type { SongLanguage } from "@/lib/songs/lyrics";
import { writeRap } from "@/lib/songs/rap";
import { assertNoRealArtists, SongSafetyError } from "@/lib/songs/safety";
import { getSong } from "@/lib/songs/songs";
import { findGenre } from "@/lib/songs/styles";

const rapRequestSchema = z.object({
  startSec: z.number().finite().min(0),
  endSec: z.number().finite().positive(),
  idea: z.string().trim().max(200).optional(),
});

// "✨ Write bars" for Add a rap: free, like writing lyrics with AI. The remix itself is paid.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = rapRequestSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const { id } = await params;
  const song = await getSong(getDb(), userId, id).catch(() => undefined);
  if (!song || song.status !== "completed") return NextResponse.json({ error: "Song not found" }, { status: 404 });
  if (!(await allow(getRedis(), `ratelimit:song-rap:${userId}`, 60, 24 * 3600))) {
    return NextResponse.json({ error: "Daily limit for AI raps reached. Try again tomorrow." }, { status: 429 });
  }
  try {
    const llm = await llmForUser(getDb(), loadEnv(), userId);
    if (parsed.data.idea) await assertNoRealArtists(llm, [parsed.data.idea]);
    const bars = await writeRap(llm, {
      lyrics: song.lyrics,
      genre: findGenre(song.genre)?.label ?? song.genre,
      mood: song.mood,
      language: song.language as SongLanguage,
      partSec: Math.max(1, parsed.data.endSec - parsed.data.startSec),
      idea: parsed.data.idea,
    });
    await assertNoRealArtists(llm, [bars]);
    return NextResponse.json({ bars });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: err instanceof SongSafetyError ? 400 : 502 });
  }
}
