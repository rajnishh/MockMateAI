import type { Env } from "@/lib/env";
import { CURRENCIES, PLANS, planEnvName } from "./catalog";
import { Razorpay } from "./razorpay";

export function razorpayFromEnv(env: Env): Razorpay | undefined {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET || !env.RAZORPAY_WEBHOOK_SECRET) return undefined;
  return new Razorpay({ keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET });
}

// "creator_monthly:INR" -> Razorpay plan id, from RAZORPAY_PLAN_CREATOR_MONTHLY_INR etc.
export function planIdsFromEnv(source: Record<string, string | undefined> = process.env): Record<string, string | undefined> {
  const ids: Record<string, string | undefined> = {};
  for (const plan of PLANS) {
    for (const currency of CURRENCIES) ids[`${plan.id}:${currency}`] = source[planEnvName(plan, currency)];
  }
  return ids;
}
