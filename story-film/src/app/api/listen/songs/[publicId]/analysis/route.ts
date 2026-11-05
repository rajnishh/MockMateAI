import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { publicSong, publicState } from "@/lib/listen";
import { buildWhisper } from "@/lib/providers";
import { getSongAnalysis } from "@/lib/songs/analysis";

// Beats, waveform and lyric timing for a public song in the full player. Lyrics the maker hid
// aren't sent (the analysis is cached per file, so the lines are dropped here, not just not made).
export async function GET(_req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const found = await publicSong(getDb(), publicId);
  if (!found?.song.outputPath || publicState(found.song) !== "public") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const env = loadEnv();
  const whisper = env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN ? buildWhisper(env) : undefined;
  try {
    // The path was written by the worker, never taken from the request.
    const analysis = await getSongAnalysis(found.song.outputPath, found.song.lyrics, { whisper });
    return NextResponse.json(found.song.showLyrics ? analysis : { ...analysis, lines: [] }, { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch (err) {
    console.error("Song analysis failed:", (err as Error).message);
    return NextResponse.json({ error: "Couldn't read this song" }, { status: 500 });
  }
}
