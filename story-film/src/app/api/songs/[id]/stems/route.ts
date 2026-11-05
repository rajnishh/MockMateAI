import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { STEMS_CREDITS } from "@/lib/billing/catalog";
import { grantCredits, spendCredits } from "@/lib/billing/credits";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { songsAvailable } from "@/lib/providers";
import { getSongStemsQueue } from "@/lib/queue/song-stems";
import { getUserId, unauthorized } from "@/lib/session";
import { clearStems, readStemsState, STEMS, stemsDir, writeStemsState } from "@/lib/songs/mix";
import { getSong } from "@/lib/songs/songs";

async function completedSong(id: string) {
  const userId = await getUserId();
  if (!userId) return { error: unauthorized() };
  const song = await getSong(getDb(), userId, id).catch(() => undefined);
  if (!song?.outputPath || song.status !== "completed") return { error: NextResponse.json({ error: "Song not found" }, { status: 404 }) };
  return { userId, song, outputPath: song.outputPath };
}

function view(id: string, state: Awaited<ReturnType<typeof readStemsState>>) {
  return {
    ...state,
    credits: STEMS_CREDITS,
    stems: state.status === "ready" ? Object.fromEntries(STEMS.map((s) => [s, `/api/songs/${id}/stems/${s}`])) : null,
  };
}

// Where the song's stems are: not made yet, splitting, ready (with their URLs) or failed.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await completedSong(id);
  if ("error" in found) return found.error;
  return NextResponse.json(view(id, await readStemsState(stemsDir(found.outputPath, id))));
}

// Splits the song into vocals, drums, bass and music. Made once per song; trying again after a failure is allowed.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await completedSong(id);
  if ("error" in found) return found.error;
  if (!songsAvailable(loadEnv())) return NextResponse.json({ error: "Song Studio isn't available yet" }, { status: 503 });
  // The folder comes from the worker-written song path, never from the request.
  const dir = stemsDir(found.outputPath, id);
  const state = await readStemsState(dir);
  if (state.status === "ready" || state.status === "running") return NextResponse.json(view(id, state), { status: 200 });

  const db = getDb();
  const ref = `stems:${id}:${randomUUID()}`;
  if (!(await spendCredits(db, found.userId, STEMS_CREDITS, ref, "song"))) {
    return NextResponse.json({ error: `Splitting a song costs ${STEMS_CREDITS} credit.`, needCredits: true }, { status: 402 });
  }
  try {
    await clearStems(dir);
    const running = { status: "running" as const, startedAt: new Date().toISOString() };
    await writeStemsState(dir, running);
    await getSongStemsQueue().add("stems", { songId: id, userId: found.userId, songFile: found.outputPath, dir, credits: STEMS_CREDITS, ref }, { jobId: ref.replace(/:/g, "-") });
    return NextResponse.json(view(id, running), { status: 202 });
  } catch (err) {
    await grantCredits(db, found.userId, STEMS_CREDITS, "refund", ref);
    await writeStemsState(dir, { status: "failed", error: "Couldn't start splitting the song" }).catch(() => undefined);
    throw err;
  }
}
