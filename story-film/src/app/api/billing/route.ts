import { NextResponse } from "next/server";
import { PACKS, PLANS, PREMIUM_CREDITS_PER_SHOT } from "@/lib/billing/catalog";
import { razorpayFromEnv, planIdsFromEnv } from "@/lib/billing/config";
import { getBalance, recentLedger } from "@/lib/billing/credits";
import { currentSubscription } from "@/lib/billing/service";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { premiumAvailable } from "@/lib/providers";
import { getUserId, unauthorized } from "@/lib/session";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const env = loadEnv();
  const db = getDb();
  const rzp = razorpayFromEnv(env);
  const planIds = planIdsFromEnv();
  const sub = await currentSubscription(db, userId);
  return NextResponse.json({
    enabled: Boolean(rzp),
    keyId: rzp?.keys.keyId ?? null,
    balance: await getBalance(db, userId),
    freeVideosPerWeek: env.FREE_FILMS_PER_WEEK,
    premiumAvailable: premiumAvailable(env),
    premiumCreditsPerShot: PREMIUM_CREDITS_PER_SHOT,
    packs: PACKS,
    plans: PLANS.map((p) => ({ ...p, currencies: (["INR", "USD"] as const).filter((c) => planIds[`${p.id}:${c}`]) })),
    subscription: sub
      ? { plan: sub.plan, status: sub.status, currency: sub.currency, currentEnd: sub.currentEnd?.toISOString() ?? null, cancelAtPeriodEnd: sub.cancelAtPeriodEnd }
      : null,
    ledger: (await recentLedger(db, userId)).map((l) => ({ delta: l.delta, reason: l.reason, at: l.createdAt.toISOString() })),
  });
}
