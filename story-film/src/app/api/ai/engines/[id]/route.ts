import { NextResponse } from "next/server";
import { z } from "zod";
import { changeEngine, enginesView, removeEngine } from "@/lib/ai/engines";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { getUserId, unauthorized } from "@/lib/session";

const changeSchema = z.object({
  model: z.string().trim().max(120).optional(),
  key: z.string().trim().max(300).optional(),
  extra: z.string().trim().max(120).optional(),
  enabled: z.boolean().optional(),
});

// A new model, key or account (checked first), or switching the engine on or off.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = changeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  if (!(await allow(getRedis(), `ratelimit:ai-engines:${userId}`, 20, 3600))) {
    return NextResponse.json({ error: "Too many tries. Wait a bit and try again." }, { status: 429 });
  }
  const db = getDb();
  const env = loadEnv();
  try {
    await changeEngine(db, env, userId, (await params).id, parsed.data);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  return NextResponse.json(await enginesView(db, env, userId));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const db = getDb();
  await removeEngine(db, userId, (await params).id);
  return NextResponse.json(await enginesView(db, loadEnv(), userId));
}
