import { createHmac, timingSafeEqual } from "node:crypto";
import type { Currency } from "./catalog";

const API = "https://api.razorpay.com/v1";

export interface RazorpayKeys {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

function hmacHex(message: string, secret: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export class Razorpay {
  constructor(
    readonly keys: RazorpayKeys,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private async call<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchFn(`${API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.keys.keyId}:${this.keys.keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as T & { error?: { description?: string } };
    if (!res.ok) throw new Error(`Razorpay ${path}: ${data.error?.description ?? res.status}`);
    return data;
  }

  createOrder(input: { amount: number; currency: Currency; receipt: string; notes: Record<string, string> }) {
    return this.call<{ id: string; amount: number; currency: Currency }>("/orders", input);
  }

  createPlan(input: { name: string; amount: number; currency: Currency }) {
    return this.call<{ id: string }>("/plans", {
      period: "monthly",
      interval: 1,
      item: { name: input.name, amount: input.amount, currency: input.currency },
    });
  }

  // Monthly for up to 10 years; the user cancels whenever they like.
  createSubscription(input: { planId: string; notes: Record<string, string> }) {
    return this.call<{ id: string; status: string }>("/subscriptions", {
      plan_id: input.planId,
      total_count: 120,
      customer_notify: 1,
      notes: input.notes,
    });
  }

  cancelSubscription(id: string) {
    return this.call<{ id: string; status: string }>(`/subscriptions/${id}/cancel`, { cancel_at_cycle_end: 1 });
  }

  verifyOrderPayment(orderId: string, paymentId: string, signature: string): boolean {
    return safeEqual(hmacHex(`${orderId}|${paymentId}`, this.keys.keySecret), signature);
  }

  verifySubscriptionPayment(paymentId: string, subscriptionId: string, signature: string): boolean {
    return safeEqual(hmacHex(`${paymentId}|${subscriptionId}`, this.keys.keySecret), signature);
  }

  // Must be computed over the raw request body, before any JSON parsing.
  verifyWebhook(rawBody: string, signature: string): boolean {
    return safeEqual(hmacHex(rawBody, this.keys.webhookSecret), signature);
  }
}
