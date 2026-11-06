import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { listGifts, ownGiftView } from "@/lib/gifts";
import { getUserId, unauthorized } from "@/lib/session";

// The Inbox's "Gifts and duets": gifts I sent with opened / plays / replies, and songs sent back to me.
export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const base = loadEnv().BETTER_AUTH_URL;
  const { sent, replies } = await listGifts(getDb(), userId);
  return NextResponse.json({
    sent: sent.map((r) => ({
      ...ownGiftView(base, r.gift, r.songTitle, r.songStatus),
      replies: replies.filter((x) => x.originalId === r.gift.id).length,
    })),
    replies: replies.map((r) => ({
      ...ownGiftView(base, r.gift, r.songTitle, r.songStatus),
      fromName: r.fromName,
      replyToGiftId: r.originalId,
    })),
  });
}
