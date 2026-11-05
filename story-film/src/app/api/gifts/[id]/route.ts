import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { ownGiftView, setSharing } from "@/lib/gifts";
import { getUserId, unauthorized } from "@/lib/session";
import { getSong } from "@/lib/songs/songs";

const changeSchema = z.object({ sharing: z.boolean() });

// Stop sharing a gift (the link then says it isn't available) or share it again.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const parsed = changeSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const db = getDb();
  const row = await setSharing(db, userId, id, parsed.data.sharing).catch(() => undefined);
  if (!row) return NextResponse.json({ error: "Gift not found" }, { status: 404 });
  const song = await getSong(db, userId, row.songId);
  return NextResponse.json(ownGiftView(loadEnv().BETTER_AUTH_URL, row, song?.title ?? "", song?.status ?? "completed"));
}
