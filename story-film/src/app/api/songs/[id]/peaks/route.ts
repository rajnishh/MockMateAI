import { readFile, rm, writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { defaultFfmpeg } from "@/lib/ffmpeg";
import { getUserId, unauthorized } from "@/lib/session";
import { computePeaks, peaksArgs, peaksFile } from "@/lib/songs/mix";
import { getSong } from "@/lib/songs/songs";

// The song's waveform as bar heights from 0 to 1, worked out once and kept next to the song.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const song = await getSong(getDb(), userId, id).catch(() => undefined);
  if (!song?.outputPath || song.status !== "completed") return NextResponse.json({ error: "Song not found" }, { status: 404 });
  // The path was written by the worker, never taken from the request.
  const cache = peaksFile(song.outputPath);
  const cached = await readFile(cache, "utf8").catch(() => null);
  if (cached) return NextResponse.json(JSON.parse(cached), { headers: { "Cache-Control": "private, max-age=86400" } });
  const raw = `${cache}.pcm`;
  try {
    await defaultFfmpeg(peaksArgs(song.outputPath, raw));
    const body = { peaks: computePeaks(await readFile(raw)) };
    await writeFile(cache, JSON.stringify(body));
    return NextResponse.json(body, { headers: { "Cache-Control": "private, max-age=86400" } });
  } finally {
    await rm(raw, { force: true });
  }
}
