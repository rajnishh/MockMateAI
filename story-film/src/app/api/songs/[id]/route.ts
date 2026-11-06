import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { ownListenView } from "@/lib/listen";
import { getUserId, unauthorized } from "@/lib/session";
import { getSong, songView } from "@/lib/songs/songs";
import { ownRemixOf } from "@/lib/remixes";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const db = getDb();
  const song = await getSong(db, userId, id).catch(() => undefined);
  if (!song) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // A remix of someone's song carries its credit line, which can't be removed.
  return NextResponse.json({ ...songView(song), listen: ownListenView(loadEnv().BETTER_AUTH_URL, song), remixOf: await ownRemixOf(db, song) });
}
