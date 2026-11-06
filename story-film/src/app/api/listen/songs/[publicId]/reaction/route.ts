import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { publicSong, publicState, reactionSchema, reactToSong } from "@/lib/listen";
import { getUserId, unauthorized } from "@/lib/session";

// One reaction per person per song; null takes it back.
export async function PUT(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { publicId } = await params;
  const parsed = reactionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Unknown reaction" }, { status: 400 });
  const db = getDb();
  const found = await publicSong(db, publicId);
  if (!found || publicState(found.song) !== "public") return NextResponse.json({ error: "Not found" }, { status: 404 });
  await reactToSong(db, found.song, userId, parsed.data.kind);
  return NextResponse.json({ ok: true });
}
