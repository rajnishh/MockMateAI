import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { giftState, publicGift } from "@/lib/gifts";
import { buildWhisper } from "@/lib/providers";
import { getSongAnalysis } from "@/lib/songs/analysis";

// When each lyric line is sung, for the gift page's sing-along. The same cached analysis as the
// app's player: Whisper's word timings when it heard the singing, else lines spread by length.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await publicGift(getDb(), token);
  if (!found || giftState(found) !== "ready" || !found.song.outputPath) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const env = loadEnv();
  const whisper = env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN ? buildWhisper(env) : undefined;
  try {
    // The path was written by the worker, never taken from the request.
    const { lines, timing } = await getSongAnalysis(found.song.outputPath, found.song.lyrics, { whisper });
    return NextResponse.json({ lines, timing }, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (err) {
    console.error("Gift lyrics timing failed:", (err as Error).message);
    return NextResponse.json({ error: "Couldn't time the lyrics" }, { status: 500 });
  }
}
