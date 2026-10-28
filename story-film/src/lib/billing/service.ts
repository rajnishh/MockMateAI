import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { purchase, subscription, webhookEvent } from "@/lib/db/schema";
import { type Currency, findPack, findPlan, PLANS } from "./catalog";
import { grantCredits } from "./credits";
import type { Razorpay } from "./razorpay";

export class BillingError extends Error {}

// Subscriptions in these states block starting another one.
const LIVE = ["created", "authenticated", "active", "pending"];

export async function startPackCheckout(db: Db, rzp: Razorpay, userId: string, packId: string, currency: Currency) {
  const pack = findPack(packId);
  if (!pack) throw new BillingError("Unknown pack");
  const amount = pack.price[currency];
  const receipt = crypto.randomUUID();
  const order = await rzp.createOrder({ amount, currency, receipt, notes: { userId, pack: pack.id } });
  await db.insert(purchase).values({
    id: receipt,
    userId,
    pack: pack.id,
    currency,
    amount,
    credits: pack.credits,
    razorpayOrderId: order.id,
  });
  return { orderId: order.id, amount, currency, name: `${pack.name} · ${pack.credits} credits` };
}

// Called from the checkout callback and from the order.paid webhook; whichever
// arrives first credits the user, the other is a no-op.
export async function completePackPayment(db: Db, orderId: string, paymentId: string): Promise<boolean> {
  const [paid] = await db
    .update(purchase)
    .set({ status: "paid", razorpayPaymentId: paymentId, paidAt: new Date() })
    .where(and(eq(purchase.razorpayOrderId, orderId), eq(purchase.status, "created")))
    .returning();
  if (!paid) return false;
  return grantCredits(db, paid.userId, paid.credits, "purchase", paid.id);
}

export async function verifyPackCheckout(
  db: Db,
  rzp: Razorpay,
  userId: string,
  input: { orderId: string; paymentId: string; signature: string },
): Promise<void> {
  if (!rzp.verifyOrderPayment(input.orderId, input.paymentId, input.signature)) throw new BillingError("Payment could not be verified");
  const [row] = await db.select().from(purchase).where(eq(purchase.razorpayOrderId, input.orderId));
  if (!row || row.userId !== userId) throw new BillingError("Unknown order");
  await completePackPayment(db, input.orderId, input.paymentId);
}

export async function startSubscription(
  db: Db,
  rzp: Razorpay,
  userId: string,
  planId: string,
  currency: Currency,
  planIds: Record<string, string | undefined>,
) {
  const plan = findPlan(planId);
  if (!plan) throw new BillingError("Unknown plan");
  const razorpayPlanId = planIds[`${plan.id}:${currency}`];
  if (!razorpayPlanId) throw new BillingError("This plan isn't available in that currency yet");
  if (await currentSubscription(db, userId)) throw new BillingError("You already have a monthly plan. Cancel it first to switch.");
  const sub = await rzp.createSubscription({ planId: razorpayPlanId, notes: { userId, plan: plan.id } });
  await db.insert(subscription).values({ userId, plan: plan.id, currency, razorpaySubscriptionId: sub.id, status: sub.status });
  return { subscriptionId: sub.id, name: `${plan.name} · ${plan.credits} credits/month` };
}

// Checkout confirms the mandate; credits arrive with the subscription.charged webhook.
export async function verifySubscriptionCheckout(
  db: Db,
  rzp: Razorpay,
  userId: string,
  input: { subscriptionId: string; paymentId: string; signature: string },
): Promise<void> {
  const [row] = await db.select().from(subscription).where(eq(subscription.razorpaySubscriptionId, input.subscriptionId));
  if (!row || row.userId !== userId) throw new BillingError("Unknown subscription");
  if (!rzp.verifySubscriptionPayment(input.paymentId, row.razorpaySubscriptionId, input.signature)) {
    throw new BillingError("Payment could not be verified");
  }
  if (row.status === "created") {
    await db.update(subscription).set({ status: "authenticated" }).where(eq(subscription.id, row.id));
  }
}

export async function currentSubscription(db: Db, userId: string) {
  const [row] = await db
    .select()
    .from(subscription)
    .where(and(eq(subscription.userId, userId), inArray(subscription.status, LIVE)))
    .orderBy(desc(subscription.createdAt))
    .limit(1);
  return row;
}

export async function cancelSubscription(db: Db, rzp: Razorpay, userId: string): Promise<void> {
  const sub = await currentSubscription(db, userId);
  if (!sub) throw new BillingError("No active monthly plan");
  await rzp.cancelSubscription(sub.razorpaySubscriptionId);
  // Stays active until the period ends; the cancelled webhook flips the status.
  await db.update(subscription).set({ cancelAtPeriodEnd: true }).where(eq(subscription.id, sub.id));
}

interface WebhookEvent {
  event: string;
  payload: {
    payment?: { entity: { id: string; order_id?: string | null } };
    order?: { entity: { id: string } };
    subscription?: { entity: { id: string; status: string; current_end?: number | null } };
  };
}

// Handles one verified webhook. Credit grants are keyed by payment id, so
// processing an event twice is harmless; the event id is recorded only after
// success, so a failed attempt is retried when Razorpay redelivers.
export async function handleWebhook(db: Db, eventId: string, event: WebhookEvent): Promise<"handled" | "duplicate" | "ignored"> {
  const [seen] = await db.select().from(webhookEvent).where(eq(webhookEvent.id, eventId));
  if (seen) return "duplicate";
  const result = await applyWebhook(db, event);
  await db.insert(webhookEvent).values({ id: eventId }).onConflictDoNothing();
  return result;
}

async function applyWebhook(db: Db, event: WebhookEvent): Promise<"handled" | "ignored"> {
  if (event.event === "order.paid" || event.event === "payment.captured") {
    const payment = event.payload.payment?.entity;
    const orderId = event.payload.order?.entity.id ?? payment?.order_id;
    if (payment && orderId) await completePackPayment(db, orderId, payment.id);
    return "handled";
  }

  const subEntity = event.payload.subscription?.entity;
  if (!event.event.startsWith("subscription.") || !subEntity) return "ignored";
  const [row] = await db.select().from(subscription).where(eq(subscription.razorpaySubscriptionId, subEntity.id));
  if (!row) return "ignored";

  // Webhooks can arrive out of order; never revive a finished subscription.
  const finished = ["cancelled", "completed"];
  const status = finished.includes(row.status) && !finished.includes(subEntity.status) ? row.status : subEntity.status;
  await db
    .update(subscription)
    .set({
      status,
      currentEnd: subEntity.current_end ? new Date(subEntity.current_end * 1000) : row.currentEnd,
    })
    .where(eq(subscription.id, row.id));

  if (event.event === "subscription.charged" && event.payload.payment) {
    const plan = PLANS.find((p) => p.id === row.plan);
    if (plan) await grantCredits(db, row.userId, plan.credits, "subscription", event.payload.payment.entity.id);
  }
  return "handled";
}
