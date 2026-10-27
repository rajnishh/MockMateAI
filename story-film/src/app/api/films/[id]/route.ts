import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { filmView, getFilm } from "@/lib/films";
import { getUserId, unauthorized } from "@/lib/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const film = await getFilm(getDb(), userId, id).catch(() => undefined);
  if (!film) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(filmView(film));
}
