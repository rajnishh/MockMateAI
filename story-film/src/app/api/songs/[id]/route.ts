import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/session";
import { getSong, songView } from "@/lib/songs/songs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const song = await getSong(getDb(), userId, id).catch(() => undefined);
  if (!song) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(songView(song));
}
