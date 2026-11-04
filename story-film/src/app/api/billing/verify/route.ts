import { NextResponse } from "next/server";
import { z } from "zod";
import { razorpayFromEnv } from "@/lib/billing/config";
import { getBalance } from "@/lib/billing/credits";
import { BillingError, verifyPackCheckout, verifySubscriptionCheckout } from "@/lib/billing/service";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { getUserId, unauthorized } from "@/lib/session";

// Fields exactly as Razorpay Checkout hands them to the success handler.
const schema = z.union([
  z.object({ razorpay_order_id: z.string(), razorpay_payment_id: z.string(), razorpay_signature: z.string() }),
  z.object({ razorpay_subscription_id: z.string(), razorpay_payment_id: z.string(), razorpay_signature: z.string() }),
]);

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const rzp = razorpayFromEnv(loadEnv());
  if (!rzp) return NextResponse.json({ error: "Payments aren't set up yet" }, { status: 503 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment response" }, { status: 400 });
  const db = getDb();
  try {
    const p = parsed.data;
    if ("razorpay_order_id" in p) {
      await verifyPackCheckout(db, rzp, userId, { orderId: p.razorpay_order_id, paymentId: p.razorpay_payment_id, signature: p.razorpay_signature });
    } else {
      await verifySubscriptionCheckout(db, rzp, userId, {
        subscriptionId: p.razorpay_subscription_id,
        paymentId: p.razorpay_payment_id,
        signature: p.razorpay_signature,
      });
    }
    return NextResponse.json({ balance: await getBalance(db, userId) });
  } catch (err) {
    if (err instanceof BillingError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
