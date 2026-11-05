import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { pushToken } from "@/lib/db/schema";

// Push notifications through Expo's push service (free; no key needed for Expo push tokens).
// Used for the community features: a gift opened or answered, and a Jugalbandi's steps.

export const PUSH_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/;
const EXPO_PUSH = "https://exp.host/--/api/v2/push/send";

export interface PushMessage {
  title: string;
  body: string;
  // Where the app opens when it's tapped, e.g. "/duets/<id>" or "/inbox".
  path: string;
}

export async function savePushToken(db: Db, userId: string, token: string): Promise<void> {
  await db
    .insert(pushToken)
    .values({ token, userId })
    .onConflictDoUpdate({ target: pushToken.token, set: { userId, updatedAt: new Date() } });
}

export async function removePushToken(db: Db, userId: string, token: string): Promise<void> {
  const [row] = await db.select().from(pushToken).where(eq(pushToken.token, token));
  if (row?.userId === userId) await db.delete(pushToken).where(eq(pushToken.token, token));
}

// Sends to every phone these people use. Tokens Expo says are gone are deleted.
export async function sendPush(db: Db, userIds: (string | null | undefined)[], msg: PushMessage, fetchFn: typeof fetch = fetch): Promise<number> {
  const ids = [...new Set(userIds.filter((x): x is string => Boolean(x)))];
  if (!ids.length) return 0;
  const tokens = (await db.select({ token: pushToken.token }).from(pushToken).where(inArray(pushToken.userId, ids))).map((r) => r.token);
  let sent = 0;
  for (let i = 0; i < tokens.length; i += 100) {
    const batch = tokens.slice(i, i + 100);
    const res = await fetchFn(EXPO_PUSH, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(batch.map((to) => ({ to, title: msg.title, body: msg.body, data: { path: msg.path }, sound: "default" }))),
    });
    const out = (await res.json().catch(() => ({}))) as { data?: { status: string; details?: { error?: string } }[] };
    const gone = (out.data ?? []).flatMap((r, j) => (r.status === "error" && r.details?.error === "DeviceNotRegistered" ? [batch[j]] : []));
    if (gone.length) await db.delete(pushToken).where(inArray(pushToken.token, gone));
    sent += (out.data ?? []).filter((r) => r.status === "ok").length;
  }
  return sent;
}

// For routes: a notification never fails or slows the action that caused it.
export function notify(db: Db, userIds: (string | null | undefined)[], msg: PushMessage): void {
  sendPush(db, userIds, msg).catch((err) => console.error("push failed:", (err as Error).message));
}
