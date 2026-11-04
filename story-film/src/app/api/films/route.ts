import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { filmView, listFilms } from "@/lib/films";
import { getUserId, unauthorized } from "@/lib/session";
import { StartError, startFilm } from "@/lib/start-film";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  return NextResponse.json({ films: (await listFilms(getDb(), userId)).map(filmView) });
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  try {
    return NextResponse.json(await startFilm(userId, await req.json()), { status: 202 });
  } catch (err) {
    if (err instanceof StartError) return NextResponse.json({ error: err.message, ...(err.needCredits ? { needCredits: true } : {}) }, { status: err.status });
    throw err;
  }
}
