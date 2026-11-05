import { NextResponse } from "next/server";
import { SONG_CREDITS, STANDARD_CREDITS, TUNE_SONG_CREDITS } from "@/lib/billing/catalog";
import { loadEnv } from "@/lib/env";
import { songsAvailable } from "@/lib/providers";
import { getUserId, unauthorized } from "@/lib/session";
import { defaultPlan } from "@/lib/voice-create/heard";
import { deleteTake, loadTake } from "@/lib/voice-create/takes";

const gone = () => NextResponse.json({ error: "That recording has expired." }, { status: 404 });

// One of "My recordings", in the same shape as a new upload's reply, so it opens "Here's what I heard" again.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const env = loadEnv();
  const take = await loadTake(env.OUTPUT_DIR, userId, (await params).id);
  if (!take || take.meta.durationSec <= 0) return gone();
  const { meta } = take;
  return NextResponse.json({
    takeId: meta.id,
    durationSec: meta.durationSec,
    video: Boolean(meta.videoFile),
    kind: meta.kind,
    transcript: meta.transcript,
    // Takes from before plans were saved get the plan Reelkar makes without the AI.
    plan: meta.plan ?? defaultPlan(meta.kind, meta.transcript),
    credits: { tune: TUNE_SONG_CREDITS, song: SONG_CREDITS, reel: STANDARD_CREDITS },
    songsAvailable: songsAvailable(env),
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const env = loadEnv();
  const { id } = await params;
  if (!(await loadTake(env.OUTPUT_DIR, userId, id))) return gone();
  await deleteTake(env.OUTPUT_DIR, userId, id);
  return new Response(null, { status: 204 });
}
