import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  Environment,
  type JWSTransactionDecodedPayload,
  NotificationTypeV2,
  type ResponseBodyV2DecodedPayload,
  SignedDataVerifier,
} from "@apple/app-store-server-library";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { appStoreAccount, creditLedger, webhookEvent } from "@/lib/db/schema";
import { PACKS } from "./catalog";
import { getBalance, grantCredits } from "./credits";
import { BillingError } from "./service";

// Apple In-App Purchase for credit packs on the iPhone app (App Review guideline 3.1.1; decision 10).
// The app buys a consumable with StoreKit 2, sends us the signed transaction (a JWS), and finishes
// the transaction only after we credited it. App Store Server Notifications V2 tell us about refunds.

export const APPLE_BUNDLE_ID = "app.reelkar";

// What we need from Apple's SignedDataVerifier; tests inject a fake one.
export interface AppleVerifier {
  verifyAndDecodeTransaction(signedTransactionInfo: string): Promise<JWSTransactionDecodedPayload>;
  verifyAndDecodeNotification(signedPayload: string): Promise<ResponseBodyV2DecodedPayload>;
}

export function packForProduct(productId: string | undefined) {
  return productId ? PACKS.find((p) => p.appStoreProductId === productId) : undefined;
}

const ROOTS_DIR = "src/lib/billing/apple-roots";

function appleRootCertificates(dir = process.env.APPLE_ROOT_CERTS_DIR ?? ROOTS_DIR): Buffer[] {
  const full = path.resolve(/*turbopackIgnore: true*/ dir);
  return readdirSync(full)
    .filter((f) => f.endsWith(".cer"))
    .map((f) => readFileSync(path.join(full, f)));
}

// Production first, then Sandbox: App Review buys with sandbox accounts against the production
// server, so a production server must accept both. With APPLE_IAP_ENVIRONMENT=Sandbox (local and
// TestFlight testing) only sandbox transactions are accepted. Production needs APPLE_APP_APPLE_ID,
// the app's numeric Apple ID from App Store Connect.
export function appleVerifiersFromEnv(env: Record<string, string | undefined> = process.env): AppleVerifier[] {
  const mode = env.APPLE_IAP_ENVIRONMENT === "Production" ? "Production" : "Sandbox";
  const roots = appleRootCertificates();
  const sandbox = new SignedDataVerifier(roots, true, Environment.SANDBOX, APPLE_BUNDLE_ID);
  if (mode === "Sandbox") return [sandbox];
  const appAppleId = Number(env.APPLE_APP_APPLE_ID);
  if (!Number.isInteger(appAppleId) || appAppleId <= 0) throw new Error("APPLE_APP_APPLE_ID is required when APPLE_IAP_ENVIRONMENT=Production");
  return [new SignedDataVerifier(roots, true, Environment.PRODUCTION, APPLE_BUNDLE_ID, appAppleId), sandbox];
}

async function firstVerified<T>(verifiers: AppleVerifier[], verify: (v: AppleVerifier) => Promise<T>): Promise<T> {
  let last: unknown;
  for (const v of verifiers) {
    try {
      return await verify(v);
    } catch (err) {
      last = err;
    }
  }
  throw new BillingError(`The App Store purchase could not be verified${last instanceof Error && last.message ? ` (${last.message})` : ""}`);
}

// The user's appAccountToken, made on first use. The app passes it to StoreKit when buying.
export async function appAccountTokenFor(db: Db, userId: string): Promise<string> {
  await db.insert(appStoreAccount).values({ userId }).onConflictDoNothing();
  const [row] = await db.select().from(appStoreAccount).where(eq(appStoreAccount.userId, userId));
  return row.appAccountToken;
}

export interface AppleCreditResult {
  // False when this transaction was already credited (the app re-sent it) or was refunded.
  credited: boolean;
  revoked: boolean;
  credits: number;
  transactionId: string;
  balance: number;
}

// Verifies one signed transaction from the app and credits its pack once (ref apple:<transactionId>).
// Throws BillingError when it isn't ours, isn't this user's or isn't a pack; the app then keeps the
// transaction unfinished, so it isn't lost.
export async function creditApplePurchase(db: Db, verifiers: AppleVerifier[], userId: string, signedTransaction: string): Promise<AppleCreditResult> {
  const tx = await firstVerified(verifiers, (v) => v.verifyAndDecodeTransaction(signedTransaction));
  if (tx.bundleId !== APPLE_BUNDLE_ID) throw new BillingError("This purchase is for another app");
  const pack = packForProduct(tx.productId);
  if (!pack) throw new BillingError("Unknown App Store product");
  if (!tx.transactionId) throw new BillingError("The purchase has no transaction id");
  const token = await appAccountTokenFor(db, userId);
  if (tx.appAccountToken?.toLowerCase() !== token.toLowerCase()) throw new BillingError("This purchase belongs to another Reelkar account");
  const credits = pack.credits * Math.max(1, tx.quantity ?? 1);
  // A refunded transaction is never credited; the app may still finish it.
  if (tx.revocationDate) return { credited: false, revoked: true, credits, transactionId: tx.transactionId, balance: await getBalance(db, userId) };
  const credited = await grantCredits(db, userId, credits, "iap", `apple:${tx.transactionId}`);
  return { credited, revoked: false, credits, transactionId: tx.transactionId, balance: await getBalance(db, userId) };
}

// Takes back the credits of a refunded or revoked transaction, once (ref apple-refund:<transactionId>).
// The balance may go below zero if they were already spent; spending stops until it's topped up.
async function reverseApplePurchase(db: Db, transactionId: string): Promise<boolean> {
  const [row] = await db
    .select()
    .from(creditLedger)
    .where(and(eq(creditLedger.reason, "iap"), eq(creditLedger.ref, `apple:${transactionId}`)));
  if (!row) return false;
  return grantCredits(db, row.userId, -row.delta, "iap", `apple-refund:${transactionId}`);
}

// One App Store Server Notification V2. Only REFUND and REVOKE change anything; everything else
// (TEST, CONSUMPTION_REQUEST, REFUND_DECLINED, …) is acknowledged. The notification id is recorded
// after success, so a failed attempt is retried when Apple redelivers.
export async function handleAppleNotification(
  db: Db,
  verifiers: AppleVerifier[],
  signedPayload: string,
): Promise<"handled" | "duplicate" | "ignored"> {
  const note = await firstVerified(verifiers, (v) => v.verifyAndDecodeNotification(signedPayload));
  const eventId = note.notificationUUID ? `apple:${note.notificationUUID}` : undefined;
  if (eventId) {
    const [seen] = await db.select().from(webhookEvent).where(eq(webhookEvent.id, eventId));
    if (seen) return "duplicate";
  }
  let result: "handled" | "ignored" = "ignored";
  const type = note.notificationType;
  const signedTx = note.data?.signedTransactionInfo;
  if ((type === NotificationTypeV2.REFUND || type === NotificationTypeV2.REVOKE) && signedTx) {
    const tx = await firstVerified(verifiers, (v) => v.verifyAndDecodeTransaction(signedTx));
    if (tx.transactionId && packForProduct(tx.productId)) {
      await reverseApplePurchase(db, tx.transactionId);
      result = "handled";
    }
  }
  if (eventId) await db.insert(webhookEvent).values({ id: eventId }).onConflictDoNothing();
  return result;
}
