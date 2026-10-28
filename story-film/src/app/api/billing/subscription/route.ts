import { NextResponse } from "next/server";
import { razorpayFromEnv } from "@/lib/billing/config";
import { BillingError, cancelSubscription } from "@/lib/billing/service";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { getUserId, unauthorized } from "@/lib/session";

// Cancels at the end of the current month; credits already granted stay.
export async function DELETE() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const rzp = razorpayFromEnv(loadEnv());
  if (!rzp) return NextResponse.json({ error: "Payments aren't set up yet" }, { status: 503 });
  try {
    await cancelSubscription(getDb(), rzp, userId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof BillingError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
