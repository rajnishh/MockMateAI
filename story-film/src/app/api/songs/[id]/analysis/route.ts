import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { buildWhisper } from "@/lib/providers";
import { getUserId, unauthorized } from "@/lib/session";
import { getSongAnalysis } from "@/lib/songs/analysis";
import { getSong } from "@/lib/songs/songs";

// Loudness, beats, waveform and lyric timing for the player. Worked out on first ask, then cached.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const song = await getSong(getDb(), userId, id).catch(() => undefined);
  if (!song?.outputPath || song.status !== "completed") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const env = loadEnv();
  const whisper = env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN ? buildWhisper(env) : undefined;
  try {
    // The path was written by the worker, never taken from the request.
    const analysis = await getSongAnalysis(song.outputPath, song.lyrics, { whisper });
    return NextResponse.json(analysis, { headers: { "Cache-Control": "private, max-age=86400" } });
  } catch (err) {
    console.error("Song analysis failed:", (err as Error).message);
    return NextResponse.json({ error: "Couldn't read this song" }, { status: 500 });
  }
}
