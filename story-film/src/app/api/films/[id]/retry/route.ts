import { NextResponse } from "next/server";
import { retryFilm } from "@/lib/retry-film";
import { getUserId, unauthorized } from "@/lib/session";
import { StartError } from "@/lib/start-film";

// "Try again" on a failed reel: the same request as a new reel, which replaces the failed one.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  try {
    return NextResponse.json(await retryFilm(userId, id), { status: 202 });
  } catch (err) {
    if (err instanceof StartError) return NextResponse.json({ error: err.message, ...(err.needCredits ? { needCredits: true } : {}) }, { status: err.status });
    throw err;
  }
}
