import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { setAllowRemix } from "@/lib/remixes";
import { getUserId, unauthorized } from "@/lib/session";

const bodySchema = z.object({ allow: z.boolean() });

// The maker's Allow remixes switch. Off stops new remixes of this song only; ones already made stay.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const { id } = await params;
  const s = await setAllowRemix(getDb(), userId, id, parsed.data.allow).catch(() => undefined);
  if (!s) return NextResponse.json({ error: "Song not found" }, { status: 404 });
  return NextResponse.json({ allowRemix: s.allowRemix && !s.voiceProfileId });
}
