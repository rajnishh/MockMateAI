import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { blockSchema, blockTarget, blockUser, listBlocks, unblockUser } from "@/lib/moderation";
import { getUserId, unauthorized } from "@/lib/session";

// Settings > Blocked creators.
export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  return NextResponse.json({ blocks: await listBlocks(getDb(), userId) });
}

// Block someone: { handle } from a song or recipe, { gift: token } from a song sent back, or
// { duet: id } from a Jugalbandi. Their songs, recipes and remixes stop showing for me, and their
// new gifts and invites don't reach me. They aren't told.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = blockSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const db = getDb();
  const target = await blockTarget(db, userId, parsed.data);
  if ("error" in target) return NextResponse.json({ error: target.error }, { status: target.status });
  const done = await blockUser(db, userId, target.userId);
  if ("error" in done) return NextResponse.json({ error: done.error }, { status: done.status });
  return NextResponse.json({ ok: true }, { status: 201 });
}

// Unblock: ?user={id} from the list, or the same body as POST (Unblock on a song or recipe page).
export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const db = getDb();
  let blockedId = new URL(req.url).searchParams.get("user")?.slice(0, 100);
  if (!blockedId) {
    const parsed = blockSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
    const target = await blockTarget(db, userId, parsed.data);
    if ("error" in target) return NextResponse.json({ error: target.error }, { status: target.status });
    blockedId = target.userId;
  }
  await unblockUser(db, userId, blockedId);
  return NextResponse.json({ ok: true });
}
