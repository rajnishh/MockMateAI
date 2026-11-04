import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { deleteFilm, filmView, getFilm } from "@/lib/films";
import { loadEnv } from "@/lib/env";
import { getUserId, unauthorized } from "@/lib/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const film = await getFilm(getDb(), userId, id).catch(() => undefined);
  if (!film) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(filmView(film));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const result = await deleteFilm(getDb(), userId, id, loadEnv().OUTPUT_DIR);
  if (result === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (result === "busy") {
    return NextResponse.json({ error: "This reel is still being made or posted. Try again when it's done." }, { status: 409 });
  }
  return new Response(null, { status: 204 });
}
