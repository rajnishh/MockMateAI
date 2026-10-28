"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Currency = "INR" | "USD";
type Pack = { id: string; name: string; credits: number; price: Record<Currency, number> };
type Plan = Pack & { currencies: Currency[] };
type Billing = {
  enabled: boolean;
  balance: number;
  freeVideosPerWeek: number;
  premiumAvailable: boolean;
  premiumCreditsPerShot: number;
  packs: Pack[];
  plans: Plan[];
  subscription: { plan: string; status: string; currentEnd: string | null; cancelAtPeriodEnd: boolean } | null;
  ledger: { delta: number; reason: string; at: string }[];
};

type RazorpayResponse = Record<string, string>;
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open(): void; on(event: string, cb: (r: { error: { description: string } }) => void): void };
  }
}

const REASONS: Record<string, string> = {
  purchase: "Credit pack",
  subscription: "Monthly plan",
  video: "Video",
  refund: "Refund (video failed)",
  grant: "Bonus",
};

function formatPrice(minor: number, currency: Currency) {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "INR" ? 0 : 2,
  }).format(minor / 100);
}

// Visitors in India see rupees (UPI, cards, netbanking); everyone else sees dollars.
function defaultCurrency(): Currency {
  return Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Calcutta" ||
    Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Kolkata"
    ? "INR"
    : "USD";
}

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load the payment window"));
    document.body.appendChild(s);
  });
}

export default function BillingPage() {
  const [data, setData] = useState<Billing | null>(null);
  const [currency, setCurrency] = useState<Currency>("INR");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/billing");
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    setCurrency(defaultCurrency());
    load();
  }, [load]);

  async function buy(kind: "pack" | "plan", id: string) {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      await loadCheckout();
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, currency }),
      });
      const checkout = await res.json();
      if (!res.ok) throw new Error(checkout.error);
      const rzp = new window.Razorpay!({
        key: checkout.keyId,
        name: "Story to Film",
        description: checkout.name,
        ...(kind === "pack" ? { order_id: checkout.orderId } : { subscription_id: checkout.subscriptionId }),
        theme: { color: "#b45309" },
        handler: async (response: RazorpayResponse) => {
          const verify = await fetch("/api/billing/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response),
          });
          const body = await verify.json();
          if (!verify.ok) return setError(body.error);
          setNotice(kind === "pack" ? "Payment received. Credits added." : "Monthly plan started. Credits arrive as soon as the first payment clears.");
          load();
          // Subscription credits come by webhook; refresh again shortly.
          if (kind === "plan") setTimeout(load, 5000);
        },
        modal: { ondismiss: () => setBusy(null) },
      });
      rzp.on("payment.failed", (r) => setError(r.error.description));
      rzp.open();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function cancelPlan() {
    if (!confirm("Cancel your monthly plan? It stays active until the end of this month.")) return;
    const res = await fetch("/api/billing/subscription", { method: "DELETE" });
    if (!res.ok) return setError((await res.json()).error);
    setNotice("Your plan will end after the current month.");
    load();
  }

  if (!data) return <main><p className="muted">Loading…</p></main>;

  return (
    <main>
      <header className="top">
        <h1>Credits</h1>
        <Link href="/">← Create</Link>
      </header>
      {notice && <div className="status">{notice}</div>}
      {error && <div className="status">{error}</div>}

      <div className="balance">
        <span className="muted">Balance</span>
        <strong>{data.balance} credits</strong>
      </div>
      <p className="muted">
        {data.freeVideosPerWeek} standard videos a week are free. After that a standard video costs 1 credit.
        {data.premiumAvailable && ` AI-animated videos cost ${data.premiumCreditsPerShot} credits per 5 seconds.`}
      </p>

      {!data.enabled ? (
        <p className="muted">Payments aren&apos;t set up on this server yet.</p>
      ) : (
        <>
          <div className="tabs" role="group" aria-label="Currency">
            <button type="button" aria-pressed={currency === "INR"} onClick={() => setCurrency("INR")}>₹ INR · UPI, cards</button>
            <button type="button" aria-pressed={currency === "USD"} onClick={() => setCurrency("USD")}>$ USD · cards</button>
          </div>

          <h2>Credit packs</h2>
          <div className="cards">
            {data.packs.map((p) => (
              <div key={p.id} className="card">
                <strong>{p.name}</strong>
                <span className="big">{p.credits} credits</span>
                <span className="muted">{formatPrice(p.price[currency], currency)} · one time</span>
                <button type="button" disabled={busy !== null} onClick={() => buy("pack", p.id)}>
                  {busy === p.id ? "Opening…" : "Buy"}
                </button>
              </div>
            ))}
          </div>

          <h2>Monthly plans</h2>
          {data.subscription ? (
            <div className="card">
              <strong>{data.plans.find((p) => p.id === data.subscription!.plan)?.name ?? data.subscription.plan}</strong>
              <span className="muted">
                Status: {data.subscription.status}
                {data.subscription.currentEnd && ` · renews ${new Date(data.subscription.currentEnd).toLocaleDateString()}`}
                {data.subscription.cancelAtPeriodEnd && " · ends after this month"}
              </span>
              {!data.subscription.cancelAtPeriodEnd && (
                <button type="button" className="secondary" onClick={cancelPlan}>Cancel plan</button>
              )}
            </div>
          ) : (
            <div className="cards">
              {data.plans.map((p) => (
                <div key={p.id} className="card">
                  <strong>{p.name}</strong>
                  <span className="big">{p.credits} credits / month</span>
                  <span className="muted">{formatPrice(p.price[currency], currency)} / month · cancel anytime</span>
                  <button type="button" disabled={busy !== null || !p.currencies.includes(currency)} onClick={() => buy("plan", p.id)}>
                    {!p.currencies.includes(currency) ? "Not available in this currency" : busy === p.id ? "Opening…" : "Subscribe"}
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="muted">Payments are processed securely by Razorpay. Prices include taxes where applicable.</p>
        </>
      )}

      {data.ledger.length > 0 && (
        <section>
          <h2>History</h2>
          <div className="library">
            {data.ledger.map((l, i) => (
              <div key={i} className="post">
                <span>{REASONS[l.reason] ?? l.reason}</span>
                <span className="muted">
                  {l.delta > 0 ? `+${l.delta}` : l.delta} · {new Date(l.at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
