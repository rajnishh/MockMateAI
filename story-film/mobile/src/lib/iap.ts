// Apple In-App Purchase for credit packs on the iPhone (StoreKit 2 through expo-iap).
// The flow: buy with the account's appAccountToken → send the signed transaction (JWS) to
// POST /api/billing/apple → finish the transaction only once the server answered. Anything left
// unfinished (the app was closed, the network dropped, Ask to Buy approved later) is sent again
// when the app starts. Android keeps its current behaviour (no buying in the app yet).
//
// expo-iap is a native module: it isn't in Expo Go, on the web, or in builds made before it was
// added, so it is loaded lazily and everything here degrades to "not available" instead of crashing.
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

import { api, type AppleCredit } from "./api";

type Iap = typeof import("expo-iap");
type Purchase = import("expo-iap").Purchase;

export interface StoreProduct {
  productId: string;
  // The App Store's own localized price, e.g. "₹249.00" or "AED 14.99".
  displayPrice: string;
  title: string;
  description: string;
}

export type BuyResult =
  | { kind: "credited"; credit: AppleCredit }
  | { kind: "cancelled" }
  // Ask to Buy or a payment that needs action: the credits arrive when Apple approves it.
  | { kind: "pending" };

// iOS only, and only when this build has the native module.
export function iapAvailable(): boolean {
  if (Platform.OS !== "ios") return false;
  try {
    return requireOptionalNativeModule("ExpoIap") != null;
  } catch {
    return false;
  }
}

let iapPromise: Promise<Iap | null> | null = null;

function loadIap(): Promise<Iap | null> {
  if (!iapAvailable()) return Promise.resolve(null);
  iapPromise ??= (async () => {
    try {
      const m = await import("expo-iap");
      await m.initConnection();
      return m;
    } catch {
      iapPromise = null;
      return null;
    }
  })();
  return iapPromise;
}

// The store's products for these ids, in the same order; unknown ids are left out.
export async function storeProducts(productIds: string[]): Promise<StoreProduct[] | null> {
  const m = await loadIap();
  if (!m || productIds.length === 0) return null;
  const found = ((await m.fetchProducts({ skus: productIds, type: "in-app" })) ?? []) as { id: string; displayPrice: string; title: string; displayName?: string | null; description: string }[];
  return productIds.flatMap((id) => {
    const p = found.find((x) => x.id === id);
    return p ? [{ productId: id, displayPrice: p.displayPrice, title: p.displayName || p.title, description: p.description }] : [];
  });
}

// Transactions being sent right now, so a replayed event doesn't credit-check twice at once.
const inFlight = new Map<string, Promise<AppleCredit | null>>();
// buy() waits here for its product's transaction to be delivered by the shared listener.
const waiters = new Map<string, { resolve: (r: BuyResult) => void; reject: (e: unknown) => void }>();
const credited = new Set<(c: AppleCredit) => void>();

// Called with each credited purchase, so a screen can refresh its balance.
export function onAppleCredit(fn: (c: AppleCredit) => void): () => void {
  credited.add(fn);
  return () => credited.delete(fn);
}

async function deliver(m: Iap, purchase: Purchase): Promise<AppleCredit | null> {
  const key = purchase.transactionId || purchase.id;
  const running = inFlight.get(key);
  if (running) return running;
  const job = (async () => {
    const jws = purchase.purchaseToken || (await m.getTransactionJwsIOS(purchase.productId).catch(() => null));
    if (!jws) return null;
    // Throws if the server is down or refuses it; the transaction then stays unfinished for next time.
    const credit = await api.applePurchase(jws);
    await m.finishTransaction({ purchase, isConsumable: true });
    for (const fn of credited) fn(credit);
    return credit;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}

let listening = false;

// Starts the shared purchase listener and re-sends unfinished transactions. Call once the creator
// is signed in (the server credits the signed-in account). Safe to call more than once.
export async function startApplePurchases(): Promise<void> {
  const m = await loadIap();
  if (!m) return;
  if (!listening) {
    listening = true;
    m.purchaseUpdatedListener((purchase) => {
      const waiter = waiters.get(purchase.productId);
      if (purchase.purchaseState === "pending") {
        if (waiter) {
          waiters.delete(purchase.productId);
          waiter.resolve({ kind: "pending" });
        }
        return;
      }
      if (purchase.purchaseState !== "purchased") return;
      deliver(m, purchase).then(
        (credit) => {
          if (!waiter) return;
          waiters.delete(purchase.productId);
          if (credit) waiter.resolve({ kind: "credited", credit });
          else waiter.reject(new Error("The App Store didn't send the purchase. Try again in a minute."));
        },
        (err) => {
          if (!waiter) return;
          waiters.delete(purchase.productId);
          waiter.reject(err);
        },
      );
    });
    m.purchaseErrorListener((error) => {
      const sku = (error as { productId?: string | null }).productId ?? null;
      const entries = sku ? [[sku, waiters.get(sku)] as const] : [...waiters.entries()];
      for (const [id, waiter] of entries) {
        if (!waiter) continue;
        waiters.delete(id);
        if (m.isUserCancelledError(error)) waiter.resolve({ kind: "cancelled" });
        else waiter.reject(new Error(m.getUserFriendlyErrorMessage(error) || "The purchase didn't go through."));
      }
    });
  }
  await resendUnfinished(m);
}

async function resendUnfinished(m: Iap) {
  try {
    const pending = await m.getPendingTransactionsIOS();
    for (const p of pending ?? []) {
      if (p.productId.startsWith("app.reelkar.credits.") && p.purchaseState === "purchased") await deliver(m, p).catch(() => undefined);
    }
  } catch {
    // Retried the next time the app starts.
  }
}

// Buys one pack. Resolves once the server credited it, or with cancelled / pending.
export async function buyPack(productId: string): Promise<BuyResult> {
  const m = await loadIap();
  if (!m) throw new Error("Buying isn't available in this version of the app.");
  await startApplePurchases();
  if (waiters.has(productId)) throw new Error("That purchase is already in progress.");
  const { appAccountToken } = await api.appleBilling();
  const result = new Promise<BuyResult>((resolve, reject) => waiters.set(productId, { resolve, reject }));
  try {
    await m.requestPurchase({ request: { apple: { sku: productId, appAccountToken } }, type: "in-app" });
  } catch (err) {
    waiters.delete(productId);
    if (m.isUserCancelledError(err)) return { kind: "cancelled" };
    throw err;
  }
  return result;
}
