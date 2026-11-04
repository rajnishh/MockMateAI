import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { currencyForTimeZone } from "@/lib/billing/catalog";
import { planIdsFromEnv } from "@/lib/billing/config";
import { getBalance, grantCredits, spendCredits } from "@/lib/billing/credits";
import { Razorpay } from "@/lib/billing/razorpay";
import {
  cancelSubscription,
  currentSubscription,
  handleWebhook,
  startPackCheckout,
  startSubscription,
  verifyPackCheckout,
  verifySubscriptionCheckout,
} from "@/lib/billing/service";
import type { Db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { testDb } from "./helpers/db";

const keys = { keyId: "rzp_test_key", keySecret: "key_secret", webhookSecret: "hook_secret" };
const hmac = (msg: string, secret: string) => createHmac("sha256", secret).update(msg).digest("hex");

// A fake Razorpay API that hands out ids unique across fakes, like the real one.
let n = 0;
function fakeRazorpay() {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    const path = url.replace("https://api.razorpay.com/v1", "");
    const body = JSON.parse(init.body as string);
    calls.push({ path, body });
    n++;
    if (path === "/orders") return new Response(JSON.stringify({ id: `order_${n}`, amount: body.amount, currency: body.currency }));
    if (path === "/subscriptions") return new Response(JSON.stringify({ id: `sub_${n}`, status: "created" }));
    return new Response(JSON.stringify({ id: path.split("/")[2], status: "active" }));
  }) as unknown as typeof fetch;
  return { rzp: new Razorpay(keys, fetchFn), calls };
}

let db: Db;
beforeAll(async () => {
  db = await testDb();
  const now = new Date();
  await db.insert(user).values(
    ["u1", "u2", "u3", "u4"].map((id) => ({ id, name: id, email: `${id}@example.com`, createdAt: now, updatedAt: now })),
  );
}, 30_000);

describe("credit ledger", () => {
  it("applies each grant once and never overdraws", async () => {
    expect(await grantCredits(db, "u1", 10, "grant", "welcome")).toBe(true);
    expect(await grantCredits(db, "u1", 10, "grant", "welcome")).toBe(false);
    expect(await spendCredits(db, "u1", 8, "film-a")).toBe(true);
    expect(await spendCredits(db, "u1", 8, "film-b")).toBe(false);
    expect(await getBalance(db, "u1")).toBe(2);
    expect(await spendCredits(db, "u2", 1, "film-c")).toBe(false);
  });
});

describe("Razorpay signatures", () => {
  const rzp = new Razorpay(keys);
  it("verifies checkout and webhook signatures", () => {
    expect(rzp.verifyOrderPayment("order_1", "pay_1", hmac("order_1|pay_1", "key_secret"))).toBe(true);
    expect(rzp.verifyOrderPayment("order_1", "pay_2", hmac("order_1|pay_1", "key_secret"))).toBe(false);
    expect(rzp.verifySubscriptionPayment("pay_1", "sub_1", hmac("pay_1|sub_1", "key_secret"))).toBe(true);
    expect(rzp.verifyWebhook('{"a":1}', hmac('{"a":1}', "hook_secret"))).toBe(true);
    expect(rzp.verifyWebhook('{"a":2}', hmac('{"a":1}', "hook_secret"))).toBe(false);
    expect(rzp.verifyWebhook('{"a":1}', "short")).toBe(false);
  });
});

describe("credit packs", () => {
  it("credits once whether checkout or the webhook arrives first", async () => {
    const { rzp, calls } = fakeRazorpay();
    const checkout = await startPackCheckout(db, rzp, "u3", "starter", "INR");
    expect(calls[0].body).toMatchObject({ amount: 24900, currency: "INR", notes: { userId: "u3", pack: "starter" } });

    const signature = hmac(`${checkout.orderId}|pay_A`, "key_secret");
    await expect(verifyPackCheckout(db, rzp, "u2", { orderId: checkout.orderId, paymentId: "pay_A", signature })).rejects.toThrow(/Unknown order/);
    await expect(verifyPackCheckout(db, rzp, "u3", { orderId: checkout.orderId, paymentId: "pay_A", signature: "bad" })).rejects.toThrow(/verified/);

    await verifyPackCheckout(db, rzp, "u3", { orderId: checkout.orderId, paymentId: "pay_A", signature });
    const event = { event: "order.paid", payload: { order: { entity: { id: checkout.orderId } }, payment: { entity: { id: "pay_A" } } } };
    expect(await handleWebhook(db, "evt_1", event)).toBe("handled");
    expect(await handleWebhook(db, "evt_1", event)).toBe("duplicate");
    expect(await getBalance(db, "u3")).toBe(50);
  });

  it("charges USD for international buyers", async () => {
    const { rzp, calls } = fakeRazorpay();
    await startPackCheckout(db, rzp, "u3", "creator", "USD");
    expect(calls[0].body).toMatchObject({ amount: 999, currency: "USD" });
  });

  it("picks the visitor's currency from their time zone", () => {
    expect(currencyForTimeZone("Asia/Kolkata")).toBe("INR");
    expect(currencyForTimeZone("Asia/Dubai")).toBe("AED");
    expect(currencyForTimeZone("Europe/London")).toBe("USD");
    expect(currencyForTimeZone(undefined)).toBe("USD");
  });

  it("charges dirhams for UAE buyers", async () => {
    const { rzp, calls } = fakeRazorpay();
    await startPackCheckout(db, rzp, "u3", "pro", "AED");
    expect(calls[0].body).toMatchObject({ amount: 9200, currency: "AED" });
  });
});

describe("monthly plans", () => {
  const planIds = planIdsFromEnv({ RAZORPAY_PLAN_CREATOR_MONTHLY_INR: "plan_inr", RAZORPAY_PLAN_PRO_MONTHLY_USD: "plan_usd" });

  it("grants monthly credits per charge, once per payment", async () => {
    const { rzp, calls } = fakeRazorpay();
    await expect(startSubscription(db, rzp, "u4", "creator_monthly", "USD", planIds)).rejects.toThrow(/currency/);
    const sub = await startSubscription(db, rzp, "u4", "creator_monthly", "INR", planIds);
    expect(calls.at(-1)!.body).toMatchObject({ plan_id: "plan_inr" });
    await expect(startSubscription(db, rzp, "u4", "creator_monthly", "INR", planIds)).rejects.toThrow(/already/);

    await verifySubscriptionCheckout(db, rzp, "u4", {
      subscriptionId: sub.subscriptionId,
      paymentId: "pay_1",
      signature: hmac(`pay_1|${sub.subscriptionId}`, "key_secret"),
    });
    expect((await currentSubscription(db, "u4"))?.status).toBe("authenticated");

    const charged = (paymentId: string) => ({
      event: "subscription.charged",
      payload: {
        subscription: { entity: { id: sub.subscriptionId, status: "active", current_end: 1893456000 } },
        payment: { entity: { id: paymentId } },
      },
    });
    await handleWebhook(db, "evt_c1", charged("pay_1"));
    // Same payment in a different event (e.g. a resend) adds nothing.
    await handleWebhook(db, "evt_c1b", charged("pay_1"));
    expect(await getBalance(db, "u4")).toBe(120);
    await handleWebhook(db, "evt_c2", charged("pay_2"));
    expect(await getBalance(db, "u4")).toBe(240);
    expect((await currentSubscription(db, "u4"))?.currentEnd?.getTime()).toBe(1893456000 * 1000);
  });

  it("cancels at period end and ignores out-of-order events after cancellation", async () => {
    const { rzp, calls } = fakeRazorpay();
    await cancelSubscription(db, rzp, "u4");
    expect(calls.at(-1)!.body).toEqual({ cancel_at_cycle_end: 1 });
    const sub = (await currentSubscription(db, "u4"))!;
    expect(sub.cancelAtPeriodEnd).toBe(true);

    const entity = (status: string) => ({ event: `subscription.${status}`, payload: { subscription: { entity: { id: sub.razorpaySubscriptionId, status } } } });
    await handleWebhook(db, "evt_x1", entity("cancelled"));
    await handleWebhook(db, "evt_x2", entity("active"));
    expect(await currentSubscription(db, "u4")).toBeUndefined();
  });
});
