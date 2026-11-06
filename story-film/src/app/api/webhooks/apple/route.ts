import { NextResponse } from "next/server";
import { appleVerifiersFromEnv, handleAppleNotification } from "@/lib/billing/apple";
import { BillingError } from "@/lib/billing/service";
import { getDb } from "@/lib/db";

// App Store Server Notifications V2. Set in App Store Connect > App > App Information > App Store
// Server Notifications (Production and Sandbox): https://reelkar.istari-ai.dev/api/webhooks/apple
// Refunds and revocations take the pack's credits back; everything else is acknowledged with 200.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { signedPayload?: unknown } | null;
  if (!body || typeof body.signedPayload !== "string") return new NextResponse(null, { status: 400 });
  let verifiers;
  try {
    verifiers = appleVerifiersFromEnv();
  } catch (err) {
    console.error("App Store notifications aren't set up:", err);
    return new NextResponse(null, { status: 503 });
  }
  try {
    const result = await handleAppleNotification(getDb(), verifiers, body.signedPayload);
    return NextResponse.json({ result });
  } catch (err) {
    if (err instanceof BillingError) return new NextResponse(null, { status: 401 });
    throw err;
  }
}
