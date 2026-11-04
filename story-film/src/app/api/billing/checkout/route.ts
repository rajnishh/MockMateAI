import { NextResponse } from "next/server";
import { z } from "zod";
import { planIdsFromEnv, razorpayFromEnv } from "@/lib/billing/config";
import { BillingError, startPackCheckout, startSubscription } from "@/lib/billing/service";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { getUserId, unauthorized } from "@/lib/session";

const schema = z.object({
  kind: z.enum(["pack", "plan"]),
  id: z.string().min(1),
  currency: z.enum(["INR", "USD", "AED"]),
});

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const rzp = razorpayFromEnv(loadEnv());
  if (!rzp) return NextResponse.json({ error: "Payments aren't set up yet" }, { status: 503 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const { kind, id, currency } = parsed.data;
  try {
    const db = getDb();
    const checkout =
      kind === "pack"
        ? await startPackCheckout(db, rzp, userId, id, currency)
        : await startSubscription(db, rzp, userId, id, currency, planIdsFromEnv());
    return NextResponse.json({ keyId: rzp.keys.keyId, ...checkout });
  } catch (err) {
    if (err instanceof BillingError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
