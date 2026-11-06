import { NextResponse } from "next/server";
import { z } from "zod";
import { addEngine, enginesView } from "@/lib/ai/engines";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { getUserId, unauthorized } from "@/lib/session";

const addSchema = z.object({
  provider: z.string().max(20),
  model: z.string().trim().max(120).optional(),
  key: z.string().trim().max(300).optional(),
  extra: z.string().trim().max(120).optional(),
});

// The creator's AI engines, in the order they're tried, and what can be added. Keys never come back.
export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  return NextResponse.json(await enginesView(getDb(), loadEnv(), userId));
}

// Connect an engine: it's checked with one tiny request first, so a wrong key or model shows up now.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  if (!(await allow(getRedis(), `ratelimit:ai-engines:${userId}`, 20, 3600))) {
    return NextResponse.json({ error: "Too many tries. Wait a bit and try again." }, { status: 429 });
  }
  const db = getDb();
  const env = loadEnv();
  try {
    await addEngine(db, env, userId, parsed.data);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  return NextResponse.json(await enginesView(db, env, userId), { status: 201 });
}
