import { beforeAll, describe, expect, it } from "vitest";
import { type AppleVerifier, appAccountTokenFor, appleVerifiersFromEnv, creditApplePurchase, handleAppleNotification, packForProduct } from "@/lib/billing/apple";
import { getBalance, spendCredits } from "@/lib/billing/credits";
import type { Db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { testDb } from "./helpers/db";

// Real JWS need Apple's keys, so a fake verifier "signs" by prefixing the environment it accepts:
// "Sandbox." + JSON. A verifier for another environment refuses it, like SignedDataVerifier does.
function fakeVerifier(env: "Production" | "Sandbox"): AppleVerifier {
  const open = (jws: string) => {
    if (!jws.startsWith(`${env}.`)) throw new Error(`not a ${env} signature`);
    return JSON.parse(jws.slice(env.length + 1));
  };
  return {
    verifyAndDecodeTransaction: async (jws) => open(jws),
    verifyAndDecodeNotification: async (jws) => open(jws),
  };
}
const verifiers = [fakeVerifier("Production"), fakeVerifier("Sandbox")];
const sign = (env: "Production" | "Sandbox", payload: object) => `${env}.${JSON.stringify(payload)}`;

let db: Db;
let token1: string;
let token2: string;
beforeAll(async () => {
  db = await testDb();
  const now = new Date();
  await db.insert(user).values(["a1", "a2"].map((id) => ({ id, name: id, email: `${id}@example.com`, createdAt: now, updatedAt: now })));
  token1 = await appAccountTokenFor(db, "a1");
  token2 = await appAccountTokenFor(db, "a2");
}, 30_000);

const tx = (over: Record<string, unknown> = {}) => ({
  transactionId: "2000000001",
  productId: "app.reelkar.credits.starter",
  bundleId: "app.reelkar",
  appAccountToken: token1,
  quantity: 1,
  environment: "Production",
  ...over,
});

describe("App Store products", () => {
  it("maps every product id to one pack", () => {
    expect(packForProduct("app.reelkar.credits.starter")?.credits).toBe(50);
    expect(packForProduct("app.reelkar.credits.creator")?.credits).toBe(150);
    expect(packForProduct("app.reelkar.credits.pro")?.credits).toBe(400);
    expect(packForProduct("app.reelkar.credits.huge")).toBeUndefined();
  });

  it("keeps one appAccountToken per user", async () => {
    expect(await appAccountTokenFor(db, "a1")).toBe(token1);
    expect(token1).not.toBe(token2);
    expect(token1).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("Apple purchases", () => {
  it("credits a production purchase once", async () => {
    const jws = sign("Production", tx());
    const first = await creditApplePurchase(db, verifiers, "a1", jws);
    expect(first).toMatchObject({ credited: true, credits: 50, transactionId: "2000000001", balance: 50 });
    const again = await creditApplePurchase(db, verifiers, "a1", jws);
    expect(again).toMatchObject({ credited: false, balance: 50 });
  });

  it("accepts sandbox purchases (App Review) after the production check fails", async () => {
    const r = await creditApplePurchase(db, verifiers, "a1", sign("Sandbox", tx({ transactionId: "s-1", productId: "app.reelkar.credits.creator", environment: "Sandbox" })));
    expect(r).toMatchObject({ credited: true, credits: 150, balance: 200 });
  });

  it("refuses bad signatures, other accounts, other apps and unknown products", async () => {
    await expect(creditApplePurchase(db, verifiers, "a1", "Forged." + JSON.stringify(tx({ transactionId: "f-1" })))).rejects.toThrow(/could not be verified/);
    await expect(creditApplePurchase(db, verifiers, "a2", sign("Production", tx({ transactionId: "f-2" })))).rejects.toThrow(/another Reelkar account/);
    await expect(creditApplePurchase(db, verifiers, "a1", sign("Production", tx({ transactionId: "f-3", appAccountToken: undefined })))).rejects.toThrow(/another Reelkar account/);
    await expect(creditApplePurchase(db, verifiers, "a1", sign("Production", tx({ transactionId: "f-4", bundleId: "com.other" })))).rejects.toThrow(/another app/);
    await expect(creditApplePurchase(db, verifiers, "a1", sign("Production", tx({ transactionId: "f-5", productId: "app.reelkar.credits.huge" })))).rejects.toThrow(/Unknown/);
    // Only the sandbox verifier is configured outside production.
    await expect(creditApplePurchase(db, [fakeVerifier("Sandbox")], "a1", sign("Production", tx({ transactionId: "f-6" })))).rejects.toThrow(/could not be verified/);
    expect(await getBalance(db, "a1")).toBe(200);
  });

  it("never credits a transaction that was already refunded", async () => {
    const r = await creditApplePurchase(db, verifiers, "a2", sign("Production", tx({ transactionId: "r-0", appAccountToken: token2.toUpperCase(), revocationDate: Date.now() })));
    expect(r).toMatchObject({ credited: false, revoked: true, balance: 0 });
  });
});

describe("App Store Server Notifications", () => {
  const note = (uuid: string, notificationType: string, txPayload?: object, env: "Production" | "Sandbox" = "Production") =>
    sign(env, { notificationUUID: uuid, notificationType, data: txPayload ? { bundleId: "app.reelkar", signedTransactionInfo: sign(env, txPayload) } : undefined });

  it("takes back a refunded pack once, even if already spent", async () => {
    expect(await creditApplePurchase(db, verifiers, "a2", sign("Production", tx({ transactionId: "p-1", productId: "app.reelkar.credits.creator", appAccountToken: token2 })))).toMatchObject({ balance: 150 });
    expect(await spendCredits(db, "a2", 100, "film-x")).toBe(true);
    const refund = note("n-1", "REFUND", tx({ transactionId: "p-1", productId: "app.reelkar.credits.creator", appAccountToken: token2 }));
    expect(await handleAppleNotification(db, verifiers, refund)).toBe("handled");
    expect(await getBalance(db, "a2")).toBe(-100);
    expect(await handleAppleNotification(db, verifiers, refund)).toBe("duplicate");
    // Apple may send REVOKE too, under another notification id; the refund ref keeps it to once.
    expect(await handleAppleNotification(db, verifiers, note("n-2", "REVOKE", tx({ transactionId: "p-1", productId: "app.reelkar.credits.creator" })))).toBe("handled");
    expect(await getBalance(db, "a2")).toBe(-100);
  });

  it("handles sandbox refunds and acknowledges everything else", async () => {
    expect(await handleAppleNotification(db, verifiers, note("n-3", "REFUND", tx({ transactionId: "s-1", environment: "Sandbox" }), "Sandbox"))).toBe("handled");
    expect(await getBalance(db, "a1")).toBe(50);
    expect(await handleAppleNotification(db, verifiers, note("n-4", "TEST"))).toBe("ignored");
    expect(await handleAppleNotification(db, verifiers, note("n-5", "REFUND_DECLINED", tx()))).toBe("ignored");
    // A refund for a transaction we never credited changes nothing.
    expect(await handleAppleNotification(db, verifiers, note("n-6", "REFUND", tx({ transactionId: "unknown" })))).toBe("handled");
    expect(await getBalance(db, "a1")).toBe(50);
    await expect(handleAppleNotification(db, verifiers, "Forged.{}")).rejects.toThrow(/could not be verified/);
  });
});

describe("Apple's verifier setup", () => {
  it("loads Apple's root certificates and checks Production before Sandbox", async () => {
    expect(appleVerifiersFromEnv({ APPLE_IAP_ENVIRONMENT: "Sandbox" })).toHaveLength(1);
    expect(appleVerifiersFromEnv({ APPLE_IAP_ENVIRONMENT: "Production", APPLE_APP_APPLE_ID: "1234567890" })).toHaveLength(2);
    expect(() => appleVerifiersFromEnv({ APPLE_IAP_ENVIRONMENT: "Production" })).toThrow(/APPLE_APP_APPLE_ID/);
    // A real verifier refuses a made-up token.
    await expect(creditApplePurchase(db, appleVerifiersFromEnv({}), "a1", "eyJhbGciOiJFUzI1NiJ9.e30.c2ln")).rejects.toThrow(/could not be verified/);
  });
});
