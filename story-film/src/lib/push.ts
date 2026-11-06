import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { creatorEarning, film, pushPrefs, pushToken, recipe, song } from "@/lib/db/schema";
import type { CreatorEarning } from "@/lib/billing/earnings";
import { type PushLang, recipeUsedText, reelFailedText, reelReadyText, remixedText, songFailedText, songReadyText } from "@/lib/push-copy";

// Push notifications through Expo's push service (free; no key needed for Expo push tokens).
// Songs and reels ready or failed (from the worker), a gift opened or answered, and a Jugalbandi's
// steps. Each phone gets its own language; each creator can turn songs, reels and gifts off.

export const PUSH_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/;
const EXPO_PUSH = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS = "https://exp.host/--/api/v2/push/getReceipts";
// Expo asks to wait a while before reading receipts, which is where most dead tokens show up.
const RECEIPT_DELAY_MS = 15 * 60_000;

// Account › Notifications. "gifts" covers gifts and Jugalbandis; "remixes" remixes of your songs and what they earned.
export type PushKind = "songs" | "reels" | "gifts" | "remixes";
export type PushPrefs = Record<PushKind, boolean>;
const ALL_ON: PushPrefs = { songs: true, reels: true, gifts: true, remixes: true };
export const prefsSchema = z.object({ songs: z.boolean(), reels: z.boolean(), gifts: z.boolean(), remixes: z.boolean() }).partial();

export interface PushMessage {
  title: string;
  body: string;
  // Where the app opens when it's tapped, e.g. "/duets/<id>" or "/inbox".
  path: string;
  // Left out for pushes the creator can't turn off.
  kind?: PushKind;
}
// The same message for everyone, or written per phone language.
export type PushContent = PushMessage | ((lang: PushLang) => PushMessage);

export interface PushOptions {
  // Bearer token, needed only once "Enhanced security for push notifications" is on in Expo.
  accessToken?: string;
  // How long to wait before reading receipts; null skips them (tests pass 0 to read at once).
  receiptDelayMs?: number | null;
}

export async function savePushToken(db: Db, userId: string, token: string, phone: { platform?: "ios" | "android"; lang?: PushLang } = {}): Promise<void> {
  await db
    .insert(pushToken)
    .values({ token, userId, ...phone })
    .onConflictDoUpdate({ target: pushToken.token, set: { userId, ...phone, updatedAt: new Date() } });
}

export async function removePushToken(db: Db, userId: string, token: string): Promise<void> {
  await db.delete(pushToken).where(and(eq(pushToken.token, token), eq(pushToken.userId, userId)));
}

export async function getPushPrefs(db: Db, userId: string): Promise<PushPrefs> {
  const [row] = await db.select().from(pushPrefs).where(eq(pushPrefs.userId, userId));
  return row ? { songs: row.songs, reels: row.reels, gifts: row.gifts, remixes: row.remixes } : { ...ALL_ON };
}

export async function setPushPrefs(db: Db, userId: string, change: Partial<PushPrefs>): Promise<PushPrefs> {
  const next = { ...(await getPushPrefs(db, userId)), ...change };
  await db
    .insert(pushPrefs)
    .values({ userId, ...next })
    .onConflictDoUpdate({ target: pushPrefs.userId, set: { ...next, updatedAt: new Date() } });
  return next;
}

// Who of these people wants this kind of push (no prefs row means everything is on).
async function wanting(db: Db, ids: string[], kind: PushKind | undefined): Promise<string[]> {
  if (!kind) return ids;
  const off = await db.select().from(pushPrefs).where(and(inArray(pushPrefs.userId, ids), eq(pushPrefs[kind], false)));
  return ids.filter((id) => !off.some((r) => r.userId === id));
}

type Ticket = { status: "ok"; id?: string } | { status: "error"; message?: string; details?: { error?: string } };
const gone = (t: { status: string; details?: { error?: string } }) => t.status === "error" && t.details?.error === "DeviceNotRegistered";
const headers = (accessToken?: string) => ({
  "Content-Type": "application/json",
  Accept: "application/json",
  ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
});

// Sends to every phone these people use. Tokens Expo says are gone are deleted, from the tickets now
// and from the receipts a little later.
export async function sendPush(db: Db, userIds: (string | null | undefined)[], content: PushContent, fetchFn: typeof fetch = fetch, opts: PushOptions = {}): Promise<number> {
  const kind = (typeof content === "function" ? content("en") : content).kind;
  const ids = await wanting(db, [...new Set(userIds.filter((x): x is string => Boolean(x)))], kind);
  if (!ids.length) return 0;
  const phones = await db.select({ token: pushToken.token, lang: pushToken.lang }).from(pushToken).where(inArray(pushToken.userId, ids));
  const accessToken = opts.accessToken ?? process.env.EXPO_ACCESS_TOKEN;
  const receipts = new Map<string, string>();
  let sent = 0;
  for (let i = 0; i < phones.length; i += 100) {
    const batch = phones.slice(i, i + 100);
    const res = await fetchFn(EXPO_PUSH, {
      method: "POST",
      headers: headers(accessToken),
      body: JSON.stringify(
        batch.map(({ token, lang }) => {
          const msg = typeof content === "function" ? content(lang) : content;
          return { to: token, title: msg.title, body: msg.body, data: { path: msg.path }, sound: "default" };
        }),
      ),
    });
    const out = (await res.json().catch(() => ({}))) as { data?: Ticket[] };
    const dead = (out.data ?? []).flatMap((r, j) => (gone(r) ? [batch[j].token] : []));
    if (dead.length) await db.delete(pushToken).where(inArray(pushToken.token, dead));
    (out.data ?? []).forEach((r, j) => {
      if (r.status === "ok" && r.id) receipts.set(r.id, batch[j].token);
    });
    sent += (out.data ?? []).filter((r) => r.status === "ok").length;
  }
  const delay = opts.receiptDelayMs === undefined ? RECEIPT_DELAY_MS : opts.receiptDelayMs;
  if (delay !== null && receipts.size) {
    const check = () => checkReceipts(db, receipts, fetchFn, accessToken).catch((err) => console.error("push receipts failed:", (err as Error).message));
    // Lost on a restart; the next push to a dead token finds it again.
    if (delay === 0) await check();
    else setTimeout(check, delay).unref?.();
  }
  return sent;
}

export async function checkReceipts(db: Db, sent: Map<string, string>, fetchFn: typeof fetch = fetch, accessToken?: string): Promise<void> {
  const ids = [...sent.keys()];
  for (let i = 0; i < ids.length; i += 1000) {
    const res = await fetchFn(EXPO_RECEIPTS, { method: "POST", headers: headers(accessToken), body: JSON.stringify({ ids: ids.slice(i, i + 1000) }) });
    const out = (await res.json().catch(() => ({}))) as { data?: Record<string, Ticket> };
    const dead = Object.entries(out.data ?? {}).flatMap(([id, r]) => (gone(r) && sent.has(id) ? [sent.get(id)!] : []));
    if (dead.length) await db.delete(pushToken).where(inArray(pushToken.token, dead));
  }
}

// For routes: a notification never fails or slows the action that caused it.
export function notify(db: Db, userIds: (string | null | undefined)[], content: PushContent): void {
  sendPush(db, userIds, content).catch((err) => console.error("push failed:", (err as Error).message));
}

// The worker's triggers. Each reads the row as it is now and says "ready" or "didn't work" from its
// status; a push that fails is logged and never fails the job. Returns how many phones got it.

// Every kind of song job: new songs, tunes, remixes, "my voice" and Studio mixes.
export async function notifySong(db: Db, songId: string, fetchFn: typeof fetch = fetch, opts: PushOptions = {}): Promise<number> {
  try {
    const [s] = await db.select().from(song).where(eq(song.id, songId));
    if (!s || (s.status !== "completed" && s.status !== "failed")) return 0;
    const ok = s.status === "completed";
    return await sendPush(db, [s.userId], (lang) => ({ ...(ok ? songReadyText(lang, s.title) : songFailedText(lang, s.title)), path: `/songs/${s.id}`, kind: "songs" }), fetchFn, opts);
  } catch (err) {
    console.error(`push for song ${songId} failed:`, (err as Error).message);
    return 0;
  }
}

// A failed reel opens its making screen, which says why and offers to try again.
export async function notifyReel(db: Db, filmId: string, fetchFn: typeof fetch = fetch, opts: PushOptions = {}): Promise<number> {
  try {
    const [f] = await db.select().from(film).where(eq(film.id, filmId));
    if (!f || (f.status !== "completed" && f.status !== "failed")) return 0;
    const ok = f.status === "completed";
    return await sendPush(db, [f.userId], (lang) => ({ ...(ok ? reelReadyText(lang, f.title) : reelFailedText(lang)), path: ok ? `/reel/${f.id}` : `/making/${f.id}`, kind: "reels" }), fetchFn, opts);
  } catch (err) {
    console.error(`push for reel ${filmId} failed:`, (err as Error).message);
    return 0;
  }
}

// "Your song is being remixed", at most once a day per song: only for the first remix of that song
// that finished today (UTC). A new whole credit doesn't get its own push.
export async function notifyRemix(db: Db, earning: CreatorEarning, fetchFn: typeof fetch = fetch, opts: PushOptions = {}): Promise<number> {
  try {
    const today = new Date(`${(earning.settledAt ?? new Date()).toISOString().slice(0, 10)}T00:00:00Z`);
    const [n] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(creatorEarning)
      .where(and(eq(creatorEarning.userId, earning.userId), eq(creatorEarning.subjectRef, earning.subjectRef), eq(creatorEarning.status, "earned"), gte(creatorEarning.settledAt, today)));
    if (Number(n?.n ?? 0) > 1) return 0;
    const [s] = await db.select({ title: song.title }).from(song).where(eq(song.id, earning.subjectRef));
    if (!s) return 0;
    return await sendPush(db, [earning.userId], (lang) => ({ ...remixedText(lang, s.title, earning.hundredths), path: `/earn/${earning.subjectRef}`, kind: "remixes" }), fetchFn, opts);
  } catch (err) {
    console.error(`push for remix earning ${earning.id} failed:`, (err as Error).message);
    return 0;
  }
}

// "Someone made a reel with Diya Night", at most once a day per recipe: only for the first use of
// that recipe that settled today (UTC). Same "Remixes and earnings" switch as remixes.
export async function notifyRecipe(db: Db, earning: CreatorEarning, fetchFn: typeof fetch = fetch, opts: PushOptions = {}): Promise<number> {
  try {
    const today = new Date(`${(earning.settledAt ?? new Date()).toISOString().slice(0, 10)}T00:00:00Z`);
    const [n] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(creatorEarning)
      .where(and(eq(creatorEarning.userId, earning.userId), eq(creatorEarning.source, "recipe"), eq(creatorEarning.subjectRef, earning.subjectRef), eq(creatorEarning.status, "earned"), gte(creatorEarning.settledAt, today)));
    if (Number(n?.n ?? 0) > 1) return 0;
    const [r] = await db.select({ name: recipe.name }).from(recipe).where(eq(recipe.id, earning.subjectRef));
    if (!r) return 0;
    return await sendPush(db, [earning.userId], (lang) => ({ ...recipeUsedText(lang, r.name, earning.hundredths), path: `/earn/${earning.subjectRef}`, kind: "remixes" }), fetchFn, opts);
  } catch (err) {
    console.error(`push for recipe earning ${earning.id} failed:`, (err as Error).message);
    return 0;
  }
}
