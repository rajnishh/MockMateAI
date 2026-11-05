import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { publicSong, publicState, voteSchema, voteSong } from "@/lib/listen";
import { getUserId, unauthorized } from "@/lib/session";

// Like (1), Not for me (-1), or clear (0).
export async function PUT(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { publicId } = await params;
  const parsed = voteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Send value 1, 0 or -1" }, { status: 400 });
  const db = getDb();
  const found = await publicSong(db, publicId);
  if (!found || publicState(found.song) !== "public") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (found.song.userId === userId) return NextResponse.json({ error: "That's your own song." }, { status: 400 });
  await voteSong(db, found.song, userId, parsed.data.value);
  return NextResponse.json({ ok: true });
}
