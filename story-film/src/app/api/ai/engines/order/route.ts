import { NextResponse } from "next/server";
import { z } from "zod";
import { enginesView, reorderEngines } from "@/lib/ai/engines";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { getUserId, unauthorized } from "@/lib/session";

const orderSchema = z.object({ ids: z.array(z.string().uuid()).max(20) });

// The order engines are tried in. Reelkar's own lane always comes last.
export async function PUT(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = orderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const db = getDb();
  await reorderEngines(db, userId, parsed.data.ids);
  return NextResponse.json(await enginesView(db, loadEnv(), userId));
}
