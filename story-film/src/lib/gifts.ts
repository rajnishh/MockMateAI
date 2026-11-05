import { randomInt } from "node:crypto";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { singableLines } from "@/lib/music-video/timing";
import { gift, giftOccasion, giftPlay, giftReport, giftReportReason, song, user } from "@/lib/db/schema";

// Song gifts: a song sent as a link (mostly on WhatsApp) that opens with no sign-in, with a big
// "Reply with your own song". Design: design/community/flow-spec.md.

export type Gift = typeof gift.$inferSelect;
export type Occasion = (typeof giftOccasion.enumValues)[number];
export const OCCASIONS = giftOccasion.enumValues;

export const OCCASION_LABEL: Record<Occasion, string> = {
  birthday: "Birthday",
  wedding: "Wedding",
  eid: "Eid",
  diwali: "Diwali",
  anniversary: "Anniversary",
  rakhi: "Rakhi",
  just_because: "Just because",
};

// 56 letters and digits without look-alikes (0/O, 1/l/I), so a link read aloud or retyped still
// works. 10 of them is ~58 bits: unguessable with the page's rate limit, and short in a chat.
const TOKEN_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
export const GIFT_TOKEN = /^[2-9a-km-zA-HJ-NP-Z]{10}$/;

export function newGiftToken(): string {
  return Array.from({ length: 10 }, () => TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)]).join("");
}

export const newGiftSchema = z.object({
  toName: z.string().trim().min(1, "Say who it's for").max(40),
  fromName: z.string().trim().max(40).default(""),
  occasion: z.enum(OCCASIONS),
  note: z.string().trim().max(200).default(""),
  // A photo id from POST /api/photos; without one the song's own cover is used.
  photo: z.string().optional(),
  address: z.enum(["her", "him"]).nullable().optional(),
});

// The name a gift is signed with: the one typed on the gift, else the account's name unless it's a
// placeholder (phone sign-ups get "Creator 1234", email ones none).
export function senderDisplayName(fromName: string, accountName: string): string {
  const account = /^Creator \d{4}$/.test(accountName.trim()) ? "" : accountName.trim();
  return fromName.trim() || account || "A friend";
}

export function giftUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/g/${token}`;
}

// Tries a few tokens in the very unlikely case one is taken.
export async function insertGift(db: Db, values: Omit<typeof gift.$inferInsert, "token">): Promise<Gift> {
  for (let i = 0; ; i++) {
    try {
      const [row] = await db
        .insert(gift)
        .values({ ...values, token: newGiftToken() })
        .returning();
      return row;
    } catch (err) {
      if (i >= 4 || !/gift_token_unique|unique/i.test(String((err as { cause?: unknown }).cause ?? err))) throw err;
    }
  }
}

export async function getOwnGift(db: Db, senderId: string, id: string): Promise<Gift | undefined> {
  const [row] = await db
    .select()
    .from(gift)
    .where(and(eq(gift.id, id), eq(gift.senderId, senderId)));
  return row;
}

export async function setSharing(db: Db, senderId: string, id: string, sharing: boolean): Promise<Gift | undefined> {
  const [row] = await db
    .update(gift)
    .set({ revokedAt: sharing ? null : new Date() })
    .where(and(eq(gift.id, id), eq(gift.senderId, senderId)))
    .returning();
  return row;
}

// Everything the public page needs, looked up by the link's token. Null for an unknown token.
export async function publicGift(db: Db, token: string) {
  if (!GIFT_TOKEN.test(token)) return null;
  const [row] = await db
    .select({ gift, song, senderName: user.name })
    .from(gift)
    .innerJoin(song, eq(song.id, gift.songId))
    .innerJoin(user, eq(user.id, gift.senderId))
    .where(eq(gift.token, token));
  if (!row) return null;
  const original = row.gift.replyToGiftId ? await giftById(db, row.gift.replyToGiftId) : undefined;
  return { ...row, senderName: senderDisplayName(row.gift.fromName, row.senderName), original };
}

export type PublicGift = NonNullable<Awaited<ReturnType<typeof publicGift>>>;

async function giftById(db: Db, id: string): Promise<Gift | undefined> {
  const [row] = await db.select().from(gift).where(eq(gift.id, id));
  return row;
}

export type GiftState = "ready" | "processing" | "failed" | "removed" | "taken_down";

export function giftState(g: Pick<PublicGift, "gift" | "song">): GiftState {
  if (g.gift.takenDownAt) return "taken_down";
  if (g.gift.revokedAt) return "removed";
  if (g.song.status === "failed") return "failed";
  return g.song.status === "completed" && g.song.outputPath ? "ready" : "processing";
}

// What the page shows; no ids, paths or the sender's account details.
export function publicGiftView(g: PublicGift) {
  const state = giftState(g);
  const ready = state === "ready";
  return {
    token: g.gift.token,
    state,
    toName: g.gift.toName,
    fromName: g.senderName,
    occasion: g.gift.occasion,
    note: g.gift.note,
    address: g.gift.address,
    title: g.song.title,
    durationSec: g.song.durationSec,
    lines: ready ? singableLines(g.song.lyrics) : [],
    ownVoice: Boolean(g.song.voiceProfileId),
    audioUrl: ready ? `/api/g/${g.gift.token}/audio` : null,
    coverUrl: (g.gift.coverPath ?? g.song.coverPath) ? `/api/g/${g.gift.token}/cover` : null,
    // A reply shows "A reply to your birthday song" and links back to it while that is shared.
    replyTo: g.original && !g.original.revokedAt && !g.original.takenDownAt ? { token: g.original.token, occasion: g.original.occasion } : null,
  };
}

export type PublicGiftView = ReturnType<typeof publicGiftView>;

// Marks the gift opened (once). The sender's own visits aren't counted (the route checks that).
export async function markOpened(db: Db, giftId: string): Promise<void> {
  await db
    .update(gift)
    .set({ openedAt: new Date() })
    .where(and(eq(gift.id, giftId), isNull(gift.openedAt)));
}

// One play per browser per day; returns whether this one counted.
export async function countPlay(db: Db, giftId: string, visitor: string, now = new Date()): Promise<boolean> {
  const day = now.toISOString().slice(0, 10);
  return db.transaction(async (tx) => {
    const inserted = await tx.insert(giftPlay).values({ giftId, visitor, day }).onConflictDoNothing().returning();
    if (!inserted.length) return false;
    // A raw Date in sql`` isn't serialised by the postgres driver, so the time goes in as text.
    await tx
      .update(gift)
      .set({ playCount: sql`${gift.playCount} + 1`, lastPlayedAt: now, openedAt: sql`coalesce(${gift.openedAt}, ${now.toISOString()}::timestamp)` })
      .where(eq(gift.id, giftId));
    return true;
  });
}

export const reportSchema = z.object({
  reason: z.enum(giftReportReason.enumValues),
  details: z.string().trim().max(500).default(""),
  email: z.string().trim().email().max(200).optional().or(z.literal("").transform(() => undefined)),
});

export async function saveReport(db: Db, giftId: string, r: z.infer<typeof reportSchema>): Promise<void> {
  await db.insert(giftReport).values({ giftId, reason: r.reason, details: r.details, email: r.email ?? null });
}

// Replies: whether the first reply to this gift is still free for this person. A free reply whose
// song failed doesn't use it up. Replying to your own gift isn't a reply.
export async function replyTarget(db: Db, userId: string, token: string): Promise<{ original: Gift; senderName: string; free: boolean } | { error: string; status: number }> {
  const found = await publicGift(db, token);
  if (!found) return { error: "We couldn't find that gift.", status: 404 };
  const state = giftState(found);
  if (state === "removed" || state === "taken_down") return { error: "That gift isn't available any more.", status: 410 };
  if (found.gift.senderId === userId) return { error: "That's your own gift. Send it to someone instead.", status: 400 };
  const used = await db
    .select({ id: gift.id })
    .from(gift)
    .innerJoin(song, eq(song.id, gift.songId))
    .where(and(eq(gift.replyToGiftId, found.gift.id), eq(gift.senderId, userId), eq(gift.freeReply, true), ne(song.status, "failed")))
    .limit(1);
  return { original: found.gift, senderName: found.senderName, free: used.length === 0 };
}

// The reply is itself a gift, to the person who sent the original, with the same occasion.
export async function createReplyGift(db: Db, input: { userId: string; songId: string; original: Gift; senderName: string; free: boolean; fromName?: string }): Promise<Gift> {
  return insertGift(db, {
    songId: input.songId,
    senderId: input.userId,
    toName: input.senderName.slice(0, 40),
    fromName: (input.fromName ?? "").trim().slice(0, 40),
    occasion: input.original.occasion,
    replyToGiftId: input.original.id,
    freeReply: input.free,
  });
}

// The sender's side: gifts they sent with what happened, and replies others sent back to them.
export async function listGifts(db: Db, userId: string, limit = 50) {
  const sent = await db
    .select({ gift, songTitle: song.title, songStatus: song.status })
    .from(gift)
    .innerJoin(song, eq(song.id, gift.songId))
    .where(eq(gift.senderId, userId))
    .orderBy(desc(gift.createdAt))
    .limit(limit);
  const original = alias(gift, "original");
  const replies = await db
    .select({ gift, songTitle: song.title, songStatus: song.status, fromName: user.name, originalId: original.id })
    .from(gift)
    .innerJoin(original, eq(original.id, gift.replyToGiftId))
    .innerJoin(song, eq(song.id, gift.songId))
    .innerJoin(user, eq(user.id, gift.senderId))
    // A reply whose song failed never reached anyone; its maker can just reply again.
    .where(and(eq(original.senderId, userId), isNull(gift.revokedAt), isNull(gift.takenDownAt), ne(song.status, "failed")))
    .orderBy(desc(gift.createdAt))
    .limit(limit);
  return { sent, replies: replies.map((r) => ({ ...r, fromName: senderDisplayName(r.gift.fromName, r.fromName) })) };
}

export function ownGiftView(baseUrl: string, g: Gift, songTitle: string, songStatus: string) {
  return {
    id: g.id,
    url: giftUrl(baseUrl, g.token),
    token: g.token,
    toName: g.toName,
    occasion: g.occasion,
    note: g.note,
    songId: g.songId,
    songTitle,
    songReady: songStatus === "completed",
    isReply: Boolean(g.replyToGiftId),
    opened: Boolean(g.openedAt),
    playCount: g.playCount,
    lastPlayedAt: g.lastPlayedAt?.toISOString() ?? null,
    sharing: !g.revokedAt,
    takenDown: Boolean(g.takenDownAt),
    createdAt: g.createdAt.toISOString(),
  };
}

// A song request that answers a gift carries the gift's token, and the name the reply is signed with.
export const replyToSchema = z.object({ replyTo: z.string().regex(GIFT_TOKEN).optional(), fromName: z.string().trim().max(40).optional() });
