import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { remixInbox } from "@/lib/remixes";
import { getUserId, unauthorized } from "@/lib/session";

// The Inbox's Remixes group: remixes others made of your songs in the last 30 days.
export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  return NextResponse.json({ items: await remixInbox(getDb(), userId) });
}
