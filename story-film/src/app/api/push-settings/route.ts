import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getPushPrefs, prefsSchema, setPushPrefs } from "@/lib/push";
import { getUserId, unauthorized } from "@/lib/session";

// Account › Notifications: songs, reels, and gifts and Jugalbandis, each on or off. All on until changed.
export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  return NextResponse.json(await getPushPrefs(getDb(), userId));
}

export async function PUT(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = prefsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  return NextResponse.json(await setPushPrefs(getDb(), userId, parsed.data));
}
