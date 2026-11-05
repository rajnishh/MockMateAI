import { NextResponse } from "next/server";
import { z } from "zod";
import { SONG_CREDITS, STANDARD_CREDITS, TUNE_SONG_CREDITS } from "@/lib/billing/catalog";
import { loadEnv } from "@/lib/env";
import { buildLlm, songsAvailable } from "@/lib/providers";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { getUserId, unauthorized } from "@/lib/session";
import { understand } from "@/lib/voice-create/heard";

const schema = z.object({ text: z.string().trim().min(3).max(3000) });

// A request as text, from Siri, Shortcuts, another app's share or a deep link: the same plan as a spoken one.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Say a few words about what to make" }, { status: 400 });
  if (!(await allow(getRedis(), `ratelimit:voice-take:${userId}`, 80, 24 * 3600))) {
    return NextResponse.json({ error: "You've asked a lot today. Try again tomorrow." }, { status: 429 });
  }
  const env = loadEnv();
  let llm;
  try {
    llm = buildLlm(env);
  } catch {
    llm = undefined;
  }
  const heard = await understand(llm, { transcript: parsed.data.text, words: [], durationSec: 0, typed: true });
  return NextResponse.json({ ...heard, credits: { tune: TUNE_SONG_CREDITS, song: SONG_CREDITS, reel: STANDARD_CREDITS }, songsAvailable: songsAvailable(env) });
}
