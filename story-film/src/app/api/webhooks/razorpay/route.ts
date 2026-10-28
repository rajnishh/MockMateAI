import { NextResponse } from "next/server";
import { razorpayFromEnv } from "@/lib/billing/config";
import { handleWebhook } from "@/lib/billing/service";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";

// Configure in Razorpay Dashboard > Webhooks with events: order.paid,
// payment.captured, and all subscription.* events.
export async function POST(req: Request) {
  const rzp = razorpayFromEnv(loadEnv());
  if (!rzp) return new NextResponse(null, { status: 503 });
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  if (!rzp.verifyWebhook(raw, signature)) return new NextResponse(null, { status: 401 });
  const eventId = req.headers.get("x-razorpay-event-id");
  if (!eventId) return new NextResponse(null, { status: 400 });
  const result = await handleWebhook(getDb(), eventId, JSON.parse(raw));
  return NextResponse.json({ result });
}
