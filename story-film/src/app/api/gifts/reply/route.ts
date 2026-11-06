import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { replyTarget } from "@/lib/gifts";
import { getUserId, unauthorized } from "@/lib/session";

// Before a reply is made: who it goes to, the occasion, and whether it's still free for me.
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const token = new URL(req.url).searchParams.get("to") ?? "";
  const target = await replyTarget(getDb(), userId, token);
  if ("error" in target) return NextResponse.json({ error: target.error }, { status: target.status });
  return NextResponse.json({ toName: target.senderName, occasion: target.original.occasion, free: target.free });
}
