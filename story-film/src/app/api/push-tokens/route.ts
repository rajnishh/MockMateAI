import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { PUSH_TOKEN, removePushToken, savePushToken } from "@/lib/push";
import { getUserId, unauthorized } from "@/lib/session";

const schema = z.object({ token: z.string().regex(PUSH_TOKEN) });

// The app registers its Expo push token after the person allows notifications, and removes it on sign-out.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Not a push token" }, { status: 400 });
  await savePushToken(getDb(), userId, parsed.data.token);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (parsed.success) await removePushToken(getDb(), userId, parsed.data.token);
  return NextResponse.json({ ok: true });
}
