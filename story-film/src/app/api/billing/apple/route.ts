import { NextResponse } from "next/server";
import { z } from "zod";
import { appAccountTokenFor, appleVerifiersFromEnv, creditApplePurchase } from "@/lib/billing/apple";
import { PACKS } from "@/lib/billing/catalog";
import { BillingError } from "@/lib/billing/service";
import { getDb } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/session";

// The iPhone app asks for this before a purchase: the App Store products to show, and the
// appAccountToken to buy with, which ties the transaction to this Reelkar account.
export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  return NextResponse.json({
    appAccountToken: await appAccountTokenFor(getDb(), userId),
    products: PACKS.filter((p) => p.appStoreProductId).map((p) => ({ packId: p.id, productId: p.appStoreProductId, credits: p.credits })),
  });
}

// The StoreKit 2 signed transaction (JWS) of a credit pack bought in the iPhone app. The app
// finishes the transaction only when this answers 200, so it re-sends it until then.
const schema = z.object({ signedTransaction: z.string().min(20).max(20_000) });

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid purchase" }, { status: 400 });
  let verifiers;
  try {
    verifiers = appleVerifiersFromEnv();
  } catch (err) {
    console.error("App Store purchases aren't set up:", err);
    return NextResponse.json({ error: "App Store purchases aren't set up yet" }, { status: 503 });
  }
  try {
    return NextResponse.json(await creditApplePurchase(getDb(), verifiers, userId, parsed.data.signedTransaction));
  } catch (err) {
    if (err instanceof BillingError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
