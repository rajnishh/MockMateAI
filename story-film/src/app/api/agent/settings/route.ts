import { NextResponse } from "next/server";
import { z } from "zod";
import { setPostingMode } from "@/lib/agent/store";
import { getDb } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/session";

const schema = z.object({ postingMode: z.enum(["ask", "auto_schedule", "auto_now"]) });

// How the agent may post: ask first (default), schedule on its own, or post as soon as ready.
export async function PUT(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  await setPostingMode(getDb(), userId, parsed.data.postingMode);
  return NextResponse.json(parsed.data);
}
