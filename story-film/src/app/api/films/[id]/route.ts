import { NextResponse } from "next/server";
import { getFilmQueue } from "@/lib/queue/films";
import { getUserId } from "@/lib/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getFilmQueue().getJob(id);
  if (!job || job.data.userId !== (await getUserId(false))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const state = await job.getState();
  return NextResponse.json({
    id,
    state,
    stage: (job.progress as { stage?: string })?.stage ?? null,
    title: job.returnvalue?.title ?? null,
    error: state === "failed" ? job.failedReason : null,
  });
}
