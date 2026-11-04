import { NextResponse } from "next/server";
import { z } from "zod";
import { aiChoiceView, saveAiChoice } from "@/lib/agent/ai-planner";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { getUserId, unauthorized } from "@/lib/session";

const schema = z.object({
  provider: z.string().max(20),
  model: z.string().trim().max(120).optional(),
  key: z.string().trim().max(300).optional(),
});

// Which AI answers in Ask Reelkar for this creator, and what's on offer. The key never comes back.
export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  return NextResponse.json(await aiChoiceView(getDb(), loadEnv(), userId));
}

// Pick an AI: it's checked with one tiny message first, so a wrong key or model shows up now.
export async function PUT(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  if (!(await allow(getRedis(), `ratelimit:agent-ai:${userId}`, 20, 3600))) {
    return NextResponse.json({ error: "Too many tries. Wait a bit and try again." }, { status: 429 });
  }
  const db = getDb();
  const env = loadEnv();
  try {
    await saveAiChoice(db, env, userId, parsed.data);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  return NextResponse.json(await aiChoiceView(db, env, userId));
}
