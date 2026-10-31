import { NextResponse } from "next/server";
import { z } from "zod";
import { validTimeZone } from "@/lib/agent/time";
import { createToken, listTokens, MAX_TOKENS } from "@/lib/agent/tokens";
import { getDb } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/session";

const schema = z.object({ name: z.string().trim().min(1).max(60), timeZone: z.string().max(64).optional() });

// The creator's connector keys (never the keys themselves, only names and last four characters).
export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  return NextResponse.json({ tokens: await listTokens(getDb(), userId) });
}

// A new key, shown once.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Give the key a name, like “Claude on my laptop”." }, { status: 400 });
  const db = getDb();
  if ((await listTokens(db, userId)).length >= MAX_TOKENS) {
    return NextResponse.json({ error: `You can have ${MAX_TOKENS} keys. Remove one you no longer use first.` }, { status: 400 });
  }
  const { token, view } = await createToken(db, userId, parsed.data.name, validTimeZone(parsed.data.timeZone));
  return NextResponse.json({ token, key: view }, { status: 201 });
}
