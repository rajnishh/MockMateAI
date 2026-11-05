import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { publicSong, publicSongView, songRails } from "@/lib/listen";
import { getUserId } from "@/lib/session";

// A public song with its rails. Private or taken-down songs answer with just their state.
export async function GET(_req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const db = getDb();
  const found = await publicSong(db, publicId);
  if (!found) return NextResponse.json({ error: "We couldn't find that song." }, { status: 404 });
  const viewerId = await getUserId().catch(() => undefined);
  const view = await publicSongView(db, found, viewerId);
  if (view.state !== "public") return NextResponse.json({ state: view.state, error: view.state === "taken_down" ? "This song was removed after a report." : "This song is private now." }, { status: 410 });
  return NextResponse.json({ song: view, ...(await songRails(db, found, viewerId)) });
}
