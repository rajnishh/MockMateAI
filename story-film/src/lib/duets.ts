import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, gt, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { MY_VOICE_CREDITS, SONG_CREDITS, TUNE_SONG_CREDITS } from "@/lib/billing/catalog";
import { grantCredits, spendCredits } from "@/lib/billing/credits";
import type { Db } from "@/lib/db";
import { duet, duetReport, socialAccount, song, voiceProfile } from "@/lib/db/schema";
import { GIFT_TOKEN, newGiftToken } from "@/lib/gifts";
import { LANGUAGE_CODES } from "@/lib/languages";
import { duetInviteVisibleTo, isBlocked } from "@/lib/moderation";
import type { RemixCall } from "@/lib/songs/remix";

// Jugalbandi: A starts a duet and records a part with Hum it, B records theirs on their own phone
// (or on the invite page), and both parts are joined into one song on their tunes.
// Design: design/community/flow-spec.md (feature 2) and PLAN decision 43.

export type Duet = typeof duet.$inferSelect;
export type Role = "a" | "b";
// Someone invited by Instagram username sees the invite in the app before joining.
export type Viewer = Role | "invited";

// A song plus a song on your tune (placeholder price, owner decision 2026-11-06), so they move together.
export const DUET_CREDITS = SONG_CREDITS + TUNE_SONG_CREDITS;
// The partner's half rounds down: the starter pays any odd credit.
export const HALF_CREDITS = Math.max(1, Math.floor(DUET_CREDITS / 2));
// Finishing alone is just a song on A's tune.
export const SOLO_CREDITS = TUNE_SONG_CREDITS;
// One free retake each, then this per retake.
export const RETAKE_CREDITS = 1;
export const DUET_WINDOW_MS = 48 * 3600 * 1000;
export const EXTEND_MS = 24 * 3600 * 1000;
export const PART_MAX_SEC = 30;
// Longest a join may take to start (stitching the parts and writing lyrics) before it counts as failed.
export const JOIN_START_MS = 2 * 60 * 1000;

export const DUET_TOKEN = GIFT_TOKEN;
export const IG_HANDLE = /^[a-z0-9._]{1,30}$/i;
const igHandle = z
  .string()
  .trim()
  .transform((h) => h.replace(/^@/, ""))
  .refine((h) => h === "" || IG_HANDLE.test(h), "That doesn't look like an Instagram username")
  .default("");

export const startDuetSchema = z.object({
  topic: z.string().trim().min(3, "Say what it's about").max(200),
  genre: z.string().min(1),
  language: z.enum([...LANGUAGE_CODES, "hinglish"]).default("hi"),
  name: z.string().trim().min(1, "Add your name").max(40),
  ig: igHandle,
});

export const joinDuetSchema = z.object({
  name: z.string().trim().min(1, "Add your name").max(40),
  ig: igHandle,
  // B offers to pay half.
  split: z.boolean().default(false),
});

export class DuetError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly needCredits = false,
  ) {
    super(message);
  }
}

export function roleOf(d: Duet, userId: string): Role | null {
  if (d.starterId === userId) return "a";
  if (d.partnerId === userId) return "b";
  return null;
}

export function viewerOf(d: Duet, userId: string): Viewer | null {
  return roleOf(d, userId) ?? (d.invitedUserId === userId && !d.partnerId ? "invited" : null);
}

// Where the duet is, worked out from its row (and its song's status) so nothing has to run on a timer.
export type Phase = "recording_a" | "waiting" | "expired" | "joining" | "join_failed" | "ready" | "declined" | "cancelled" | "solo";

export function phaseOf(d: Duet, songStatus: string | null | undefined, now = new Date()): Phase {
  if (d.status === "declined" || d.status === "cancelled" || d.status === "solo") return d.status;
  // The song is being started (a few seconds). If that stalls, say a crash, it's "Try again" after a while.
  if (d.joinStartedAt && now.getTime() - d.joinStartedAt.getTime() < JOIN_START_MS) return "joining";
  if (d.status === "joining") return songStatus === "failed" ? "join_failed" : songStatus === "completed" ? "ready" : "joining";
  if (d.status === "ready") return "ready";
  if (!d.partAPath) return "recording_a";
  // Both parts are in but the song never started (the join itself failed): "Try again".
  if (d.partBPath) return "join_failed";
  if (!d.partBPath && d.expiresAt && d.expiresAt.getTime() < now.getTime()) return "expired";
  return "waiting";
}

export async function getDuet(db: Db, id: string): Promise<Duet | undefined> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return undefined;
  const [row] = await db.select().from(duet).where(eq(duet.id, id));
  return row;
}

// The duet behind an invite link. One hidden after reports (src/lib/moderation.ts) is left out, so
// its link stops working until it's reviewed; the two people in it still see it in the app.
export async function duetByToken(db: Db, token: string, opts: { hidden?: boolean } = {}): Promise<Duet | undefined> {
  if (!DUET_TOKEN.test(token)) return undefined;
  const [row] = await db.select().from(duet).where(eq(duet.token, token));
  return row && (opts.hidden || !row.hiddenAt) ? row : undefined;
}

export async function songStatusOf(db: Db, d: Duet): Promise<string | null> {
  if (!d.songId) return null;
  const [row] = await db.select({ status: song.status }).from(song).where(eq(song.id, d.songId));
  return row?.status ?? null;
}

// A pays the whole price now; it comes back if the duet is cancelled. B can take half later.
export async function startDuet(db: Db, userId: string, input: z.infer<typeof startDuetSchema>): Promise<Duet> {
  const id = crypto.randomUUID();
  if (!(await spendCredits(db, userId, DUET_CREDITS, `duet:${id}`, "song"))) {
    throw new DuetError(`A Jugalbandi costs ${DUET_CREDITS} credits.`, 402, true);
  }
  try {
    const [row] = await db
      .insert(duet)
      .values({ id, token: newGiftToken(), starterId: userId, starterName: input.name, starterIg: input.ig.replace(/^@/, ""), topic: input.topic, genre: input.genre, language: input.language, paidA: DUET_CREDITS })
      .returning();
    return row;
  } catch (err) {
    await grantCredits(db, userId, DUET_CREDITS, "refund", `duet:${id}`);
    throw err;
  }
}

async function update(db: Db, id: string, values: Partial<typeof duet.$inferInsert>): Promise<Duet> {
  const [row] = await db.update(duet).set(values).where(eq(duet.id, id)).returning();
  return row;
}

export interface PartTake {
  mp3: string;
  kind: "hum" | "sing" | "speech";
  transcript: string;
  durationSec: number;
}

// Keeps a copy of the Hum it take with the duet (takes are cleaned up after a day).
export async function savePart(db: Db, outputDir: string, d: Duet, role: Role, take: PartTake, now = new Date()): Promise<Duet> {
  const phase = phaseOf(d, null, now);
  if (phase !== "recording_a" && phase !== "waiting") throw new DuetError("This Jugalbandi isn't taking parts right now.");
  if (role === "b" && !d.partAPath) throw new DuetError("Wait for the first part.");
  const dir = path.resolve(outputDir, "duets", d.id);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `part-${role}-${now.getTime()}.mp3`);
  await copyFile(take.mp3, file);
  // Speech is someone saying their lines: sung from the words, like "sing".
  const kind = take.kind === "hum" ? "hum" : "sing";
  const sec = Math.max(1, Math.round(Math.min(take.durationSec, PART_MAX_SEC)));
  // The part that completes the pair starts the join in the same request, so it reads "joining" from now.
  const joinStartedAt = (role === "a" ? d.partBPath : d.partAPath) ? now : null;
  if (role === "a") {
    return update(db, d.id, { partAPath: file, partAKind: kind, partAText: take.transcript.slice(0, 2000), partASec: sec, joinStartedAt, expiresAt: d.partBPath ? d.expiresAt : new Date(now.getTime() + DUET_WINDOW_MS) });
  }
  return update(db, d.id, { partBPath: file, partBKind: kind, partBText: take.transcript.slice(0, 2000), partBSec: sec, joinStartedAt });
}

// B opens the invite and joins (first one in). Offering half takes B's half now; A gets theirs
// back when the song is joined, so B leaving early never costs A anything.
export async function joinDuet(db: Db, d: Duet, userId: string, input: z.infer<typeof joinDuetSchema>, now = new Date()): Promise<Duet> {
  if (d.starterId === userId) throw new DuetError("That's your own Jugalbandi. Send the link to a friend.");
  if (d.partnerId && d.partnerId !== userId) throw new DuetError("Someone else already joined this Jugalbandi.", 409);
  if (phaseOf(d, null, now) !== "waiting") throw new DuetError("This invite has closed. Ask for a new one.", 410);
  const [claimed] = await db
    .update(duet)
    .set({ partnerId: userId, partnerName: input.name, partnerIg: input.ig.replace(/^@/, "") })
    .where(and(eq(duet.id, d.id), or(isNull(duet.partnerId), eq(duet.partnerId, userId))))
    .returning();
  if (!claimed) throw new DuetError("Someone else already joined this Jugalbandi.", 409);
  if (input.split && claimed.paidB === 0) {
    if (!(await spendCredits(db, userId, HALF_CREDITS, `duet-b:${d.id}`, "song"))) throw new DuetError(`Paying half takes ${HALF_CREDITS} credits.`, 402, true);
    return update(db, d.id, { paidB: HALF_CREDITS });
  }
  return claimed;
}

async function refundPartner(db: Db, d: Duet, reason: string): Promise<void> {
  if (d.partnerId && d.paidB > 0) await grantCredits(db, d.partnerId, d.paidB, "refund", `duet-b-${reason}:${d.id}`);
}

// B says no (with an optional note for A). A's options then match "no answer".
export async function declineDuet(db: Db, d: Duet, userId: string, note: string): Promise<Duet> {
  if (d.starterId === userId) throw new DuetError("Use Cancel for your own Jugalbandi.");
  if (d.partnerId && d.partnerId !== userId) throw new DuetError("Someone else already joined this Jugalbandi.", 409);
  if (!["waiting", "expired"].includes(phaseOf(d, null)) || d.partBPath) throw new DuetError("This invite can't be declined now.");
  await refundPartner(db, d, "declined");
  await refundVoices(db, d, "declined", ["b"]);
  return update(db, d.id, { status: "declined", partnerId: userId, declineNote: note.trim().slice(0, 140), paidB: 0, voiceB: null, paidVoiceB: 0 });
}

// A gives everything back and ends it (not while the song is being made).
export async function cancelDuet(db: Db, d: Duet): Promise<Duet> {
  const phase = phaseOf(d, await songStatusOf(db, d));
  if (phase === "joining" || phase === "solo" || phase === "cancelled") throw new DuetError("This Jugalbandi can't be cancelled now.");
  if (d.paidA > 0) await grantCredits(db, d.starterId, d.paidA, "refund", `duet-cancel:${d.id}`);
  await refundPartner(db, d, "cancel");
  await refundVoices(db, d, "cancel");
  return update(db, d.id, { status: "cancelled", paidA: 0, paidB: 0, paidVoiceA: 0, paidVoiceB: 0 });
}

// "Give 24 more hours", once.
export async function extendDuet(db: Db, d: Duet, now = new Date()): Promise<Duet> {
  if (phaseOf(d, null, now) !== "expired" || d.extended) throw new DuetError("You can give more time once, after the 48 hours.");
  return update(db, d.id, { expiresAt: new Date(now.getTime() + EXTEND_MS), extended: true });
}

// "Invite someone else": a new link and a fresh 48 hours; the old link stops working.
export async function reinviteDuet(db: Db, d: Duet, now = new Date()): Promise<Duet> {
  const phase = phaseOf(d, null, now);
  if (d.partBPath || !(phase === "expired" || phase === "declined" || phase === "waiting")) throw new DuetError("You can invite someone else before a second part is in.");
  await refundPartner(db, d, `reinvite-${now.getTime()}`);
  await refundVoices(db, d, `reinvite-${now.getTime()}`, ["b"]);
  return update(db, d.id, {
    invitedUserId: null,
    invitedIg: "",
    voiceB: null,
    paidVoiceB: 0,
    remindedAt: null,
    token: newGiftToken(),
    status: "waiting",
    partnerId: null,
    partnerName: "",
    partnerIg: "",
    paidB: 0,
    declineNote: "",
    extended: false,
    expiresAt: new Date(now.getTime() + DUET_WINDOW_MS),
  });
}

// What starting the song needs from outside: ffmpeg, lyrics for a hummed part, and the queue.
export interface MakeDeps {
  outputDir: string;
  ffmpeg: (args: string[]) => Promise<void>;
  // Lyrics for a hummed part, sized to its length.
  writeLyrics: (topic: string, durationSec: number) => Promise<string>;
  tuneCall: (input: { takeMp3: string; kind: "hum" | "sing"; heardLyrics: string; lyrics: string; vocal: "auto" | "duet" }) => RemixCall;
  queue: (job: { songId: string; userId: string; title: string; call: RemixCall; credits: number; voices?: DuetVoices }) => Promise<void>;
}

// Each part re-sung in its own singer's voice after the duet is made: the song is cut where A's
// part ends (the tune keeps the parts' timing) and each side goes through "my voice" on its own.
export interface DuetVoices {
  splitSec: number;
  samples: [string | null, string | null];
}

async function voicesFor(db: Db, d: Duet): Promise<DuetVoices | undefined> {
  if (!d.voiceA && !d.voiceB) return undefined;
  const sample = async (id: string | null, owner: string | null) => {
    if (!id || !owner) return null;
    const [v] = await db.select({ samplePath: voiceProfile.samplePath }).from(voiceProfile).where(and(eq(voiceProfile.id, id), eq(voiceProfile.userId, owner)));
    return v?.samplePath ?? null;
  };
  const samples: [string | null, string | null] = [await sample(d.voiceA, d.starterId), await sample(d.voiceB, d.partnerId)];
  return samples[0] || samples[1] ? { splitSec: (d.partASec ?? 15) + 0.2, samples } : undefined;
}

// Both parts back to back, with a breath between, as one tune.
export function joinArgs(a: string, b: string, out: string): string[] {
  return [
    "-y", "-loglevel", "error",
    "-i", a, "-i", b,
    "-filter_complex", "[0:a]apad=pad_dur=0.4[a0];[a0][1:a]concat=n=2:v=0:a=1[out]",
    "-map", "[out]", "-ac", "2", "-ar", "44100", "-b:a", "192k", out,
  ];
}

// A part's lines: what was sung, or AI lines for a hum. Section tags come out, since each part is
// one verse of the duet.
async function partLyrics(deps: MakeDeps, d: Duet, kind: string | null, text: string, sec: number): Promise<string> {
  const lines = kind === "sing" && text.trim() ? text.trim() : await deps.writeLyrics(d.topic, sec);
  return lines
    .split("\n")
    .filter((l) => !/^\s*\[.*\]\s*$/.test(l))
    .join("\n")
    .trim();
}

// Joins the two parts into one song, owned by A. Paid for already; a failed join is tried again free.
export async function startJoin(db: Db, deps: MakeDeps, d: Duet, now = new Date()): Promise<Duet> {
  if (!d.partAPath || !d.partBPath) throw new DuetError("Both parts are needed first.");
  await update(db, d.id, { joinStartedAt: now });
  try {
    return await queueJoin(db, deps, d, { a: d.partAPath, b: d.partBPath }, now);
  } catch (err) {
    // Didn't start: show "Try again" straight away.
    await update(db, d.id, { joinStartedAt: null });
    throw err;
  }
}

async function queueJoin(db: Db, deps: MakeDeps, d: Duet, parts: { a: string; b: string }, now: Date): Promise<Duet> {
  const dir = path.resolve(deps.outputDir, "duets", d.id);
  const joined = path.join(dir, `joined-${now.getTime()}.mp3`);
  await deps.ffmpeg(joinArgs(parts.a, parts.b, joined));
  const [la, lb] = await Promise.all([partLyrics(deps, d, d.partAKind, d.partAText, d.partASec ?? 15), partLyrics(deps, d, d.partBKind, d.partBText, d.partBSec ?? 15)]);
  const lyrics = `[Verse 1]\n${la}\n\n[Verse 2]\n${lb}`;
  const bothHum = d.partAKind === "hum" && d.partBKind === "hum";
  const call = deps.tuneCall({ takeMp3: joined, kind: bothHum ? "hum" : "sing", heardLyrics: [d.partAText, d.partBText].join("\n").trim(), lyrics, vocal: "duet" });
  const title = d.topic.slice(0, 80);
  const [row] = await db
    .insert(song)
    .values({ userId: d.starterId, title, genre: d.genre, language: d.language, lyrics, durationSec: (d.partASec ?? 15) + (d.partBSec ?? 15), credits: 0 })
    .returning({ id: song.id });
  // The credits were paid when the duet started, so the song job refunds nothing on failure.
  await deps.queue({ songId: row.id, userId: d.starterId, title, call, credits: 0, voices: await voicesFor(db, d) });
  // B's half covers half of A's: A gets that back on the first join.
  const splitBack = d.paidB > 0 && d.paidA === DUET_CREDITS;
  if (splitBack) await grantCredits(db, d.starterId, d.paidB, "refund", `duet-split:${d.id}`);
  return update(db, d.id, { songId: row.id, status: "joining", joinStartedAt: null, approvedA: null, approvedB: null, retakeAskedOf: null, ...(splitBack ? { paidA: DUET_CREDITS - d.paidB } : {}) });
}

// "Finish it solo": a normal song on A's tune; A keeps paying only for that, B gets everything back.
export async function finishSolo(db: Db, deps: MakeDeps, d: Duet, now = new Date()): Promise<Duet> {
  const phase = phaseOf(d, null, now);
  if (!d.partAPath || d.partBPath || !(phase === "expired" || phase === "declined" || phase === "waiting")) throw new DuetError("You can finish it alone before a second part is in.");
  const lyrics = await partLyrics(deps, d, d.partAKind, d.partAText, d.partASec ?? 15);
  const call = deps.tuneCall({ takeMp3: d.partAPath, kind: d.partAKind ?? "hum", heardLyrics: d.partAText, lyrics, vocal: "auto" });
  const title = d.topic.slice(0, 80);
  const [row] = await db
    .insert(song)
    .values({ userId: d.starterId, title, genre: d.genre, language: d.language, lyrics, durationSec: d.partASec ?? 15, credits: SOLO_CREDITS })
    .returning({ id: song.id });
  await deps.queue({ songId: row.id, userId: d.starterId, title, call, credits: SOLO_CREDITS });
  if (d.paidA > SOLO_CREDITS) await grantCredits(db, d.starterId, d.paidA - SOLO_CREDITS, "refund", `duet-solo:${d.id}`);
  await refundPartner(db, d, "solo");
  // Solo is sung by an AI singer: any voice paid for comes back.
  await refundVoices(db, d, "solo");
  return update(db, d.id, { songId: row.id, status: "solo", paidA: SOLO_CREDITS, paidB: 0, paidVoiceA: 0, paidVoiceB: 0 });
}

// Sing your own part again: the first retake each is free. Both approvals start over.
export async function retakePart(db: Db, d: Duet, role: Role, userId: string, now = new Date()): Promise<Duet> {
  const phase = phaseOf(d, await songStatusOf(db, d), now);
  if (phase !== "ready" && phase !== "join_failed") throw new DuetError("You can sing your part again once the song is joined.");
  const used = role === "a" ? d.retakesA : d.retakesB;
  if (used >= 1 && !(await spendCredits(db, userId, RETAKE_CREDITS, `duet-retake:${d.id}:${role}:${used}`, "song"))) {
    throw new DuetError(`Another retake costs ${RETAKE_CREDITS} credit.`, 402, true);
  }
  return update(db, d.id, {
    status: "waiting",
    joinStartedAt: null,
    ...(role === "a" ? { partAPath: null, retakesA: used + 1 } : { partBPath: null, retakesB: used + 1 }),
    approvedA: null,
    approvedB: null,
    retakeAskedOf: null,
    expiresAt: new Date(now.getTime() + DUET_WINDOW_MS),
  });
}

export async function askRetake(db: Db, d: Duet, role: Role): Promise<Duet> {
  if (phaseOf(d, await songStatusOf(db, d)) !== "ready") throw new DuetError("Ask once the song is joined.");
  return update(db, d.id, { retakeAskedOf: role === "a" ? "b" : "a" });
}

export async function approveDuet(db: Db, d: Duet, role: Role): Promise<Duet> {
  if (phaseOf(d, await songStatusOf(db, d)) !== "ready") throw new DuetError("Approve once the song is joined.");
  return update(db, d.id, { status: "ready", ...(role === "a" ? { approvedA: new Date() } : { approvedB: new Date() }) });
}

// The Instagram Collab post needs both "yes"es, and only names the partner who sang.
export function collabAllowed(d: Duet, handle: string): boolean {
  return d.status === "ready" && Boolean(d.approvedA && d.approvedB) && d.partnerIg !== "" && d.partnerIg.toLowerCase() === handle.replace(/^@/, "").toLowerCase();
}

export async function duetForSong(db: Db, userId: string, songId: string): Promise<Duet | undefined> {
  const [row] = await db
    .select()
    .from(duet)
    .where(and(eq(duet.songId, songId), or(eq(duet.starterId, userId), eq(duet.partnerId, userId))));
  return row;
}

export async function listDuets(db: Db, userId: string, limit = 30): Promise<Duet[]> {
  return db
    .select()
    .from(duet)
    // An invite (not joined yet) doesn't show when I blocked its starter, reported it, or reports hid it.
    .where(or(eq(duet.starterId, userId), eq(duet.partnerId, userId), and(eq(duet.invitedUserId, userId), isNull(duet.partnerId), duetInviteVisibleTo(userId))))
    .orderBy(desc(duet.createdAt))
    .limit(limit);
}

// "Invite by @handle": the Reelkar account that connected that Instagram username gets the invite
// in the app (and a push). The link keeps working for anyone else until someone joins.
export async function inviteByHandle(db: Db, d: Duet, handle: string, now = new Date()): Promise<Duet> {
  const h = handle.trim().replace(/^@/, "").toLowerCase();
  if (!IG_HANDLE.test(h)) throw new DuetError("That doesn't look like an Instagram username.");
  if (d.partnerId || !["waiting", "expired"].includes(phaseOf(d, null, now))) throw new DuetError("You can invite someone while you're waiting for a partner.");
  const [acct] = await db
    .select({ userId: socialAccount.userId })
    .from(socialAccount)
    .where(and(eq(socialAccount.platform, "instagram"), sql`lower(${socialAccount.name}) = ${`@${h}`}`))
    .limit(1);
  if (!acct) throw new DuetError(`No one on Reelkar has connected @${h} yet. Send them the link instead.`, 404);
  if (acct.userId === d.starterId) throw new DuetError("That's your own Instagram. Invite a friend.");
  // Someone who blocked the starter never gets their invites; the starter isn't told why.
  if (await isBlocked(db, acct.userId, d.starterId)) throw new DuetError(`No one on Reelkar has connected @${h} yet. Send them the link instead.`, 404);
  return update(db, d.id, { invitedUserId: acct.userId, invitedIg: h });
}

// Sing your own part in one of your own consented voices (the route checks it's yours), or back to
// an AI singer. It's paid when picked and comes back when it's taken off or the duet is cancelled.
export async function setPartVoice(db: Db, d: Duet, role: Role, userId: string, voiceId: string | null): Promise<Duet> {
  const phase = phaseOf(d, await songStatusOf(db, d));
  if (!["recording_a", "waiting", "ready", "join_failed"].includes(phase)) throw new DuetError("You can change the voice before or after the song is joined.");
  const paid = role === "a" ? d.paidVoiceA : d.paidVoiceB;
  const n = d.retakesA + d.retakesB + (d.voiceA ? 1 : 0) + (d.voiceB ? 1 : 0);
  let charge = paid;
  if (voiceId && paid === 0) {
    if (!(await spendCredits(db, userId, MY_VOICE_CREDITS, `duet-voice:${d.id}:${role}:${n}:${Date.now()}`, "song"))) {
      throw new DuetError(`Singing in your own voice costs ${MY_VOICE_CREDITS} credits.`, 402, true);
    }
    charge = MY_VOICE_CREDITS;
  } else if (!voiceId && paid > 0) {
    await grantCredits(db, userId, paid, "refund", `duet-voice-off:${d.id}:${role}:${Date.now()}`);
    charge = 0;
  }
  const values = role === "a" ? { voiceA: voiceId, paidVoiceA: charge } : { voiceB: voiceId, paidVoiceB: charge };
  // Changing the voice of a joined song makes it again (both approve again).
  return update(db, d.id, { ...values, ...(phase === "ready" ? { approvedA: null, approvedB: null } : {}) });
}

async function refundVoices(db: Db, d: Duet, reason: string, which: Role[] = ["a", "b"]): Promise<void> {
  if (which.includes("a") && d.paidVoiceA > 0) await grantCredits(db, d.starterId, d.paidVoiceA, "refund", `duet-voice-${reason}-a:${d.id}`);
  if (which.includes("b") && d.paidVoiceB > 0 && d.partnerId) await grantCredits(db, d.partnerId, d.paidVoiceB, "refund", `duet-voice-${reason}-b:${d.id}`);
}

// The 24-hour reminder: a partner (joined or invited by username) who hasn't sung, once.
export async function dueReminders(db: Db, now = new Date()): Promise<Duet[]> {
  const due = await db
    .select()
    .from(duet)
    .where(
      and(
        eq(duet.status, "waiting"),
        isNotNull(duet.partAPath),
        isNull(duet.partBPath),
        isNull(duet.remindedAt),
        gt(duet.expiresAt, now),
        lte(duet.expiresAt, new Date(now.getTime() + 24 * 3600 * 1000)),
        or(isNotNull(duet.partnerId), isNotNull(duet.invitedUserId)),
      ),
    );
  for (const d of due) await update(db, d.id, { remindedAt: now });
  return due;
}

export function inviteUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/j/${token}`;
}

// What each person sees. Audio comes through routes that check who's asking.
export function duetView(d: Duet, role: Viewer, songStatus: string | null, baseUrl: string, now = new Date()) {
  const phase = phaseOf(d, songStatus, now);
  const mine = role === "a" ? d.retakesA : d.retakesB;
  return {
    id: d.id,
    role,
    token: d.token,
    invitedIg: d.invitedIg,
    // Whether my part is in my own voice (the other's voice is never offered).
    myVoiceId: role === "a" ? d.voiceA : role === "b" ? d.voiceB : null,
    voiceCredits: MY_VOICE_CREDITS,
    partAOwnVoice: Boolean(d.voiceA),
    partBOwnVoice: Boolean(d.voiceB),
    phase,
    url: inviteUrl(baseUrl, d.token),
    topic: d.topic,
    genre: d.genre,
    language: d.language,
    starterName: d.starterName,
    partnerName: d.partnerName,
    starterIg: d.starterIg,
    partnerIg: d.partnerIg,
    // An invited person hears A's part before joining, like on the invite page.
    partA: d.partAPath ? { kind: d.partAKind, sec: d.partASec, audioUrl: `/api/duets/${d.id}/audio?part=a` } : null,
    partB: d.partBPath ? { kind: d.partBKind, sec: d.partBSec, audioUrl: `/api/duets/${d.id}/audio?part=b` } : null,
    songId: role === "a" ? d.songId : null,
    songAudioUrl: d.songId && songStatus === "completed" ? `/api/duets/${d.id}/audio?part=song` : null,
    price: DUET_CREDITS,
    half: HALF_CREDITS,
    paidA: d.paidA,
    paidB: d.paidB,
    freeRetake: mine < 1,
    retakeCredits: RETAKE_CREDITS,
    approvedA: Boolean(d.approvedA),
    approvedB: Boolean(d.approvedB),
    askedToRetake: d.retakeAskedOf === role,
    expiresAt: d.expiresAt?.toISOString() ?? null,
    canExtend: phase === "expired" && !d.extended,
    declineNote: d.declineNote,
    createdAt: d.createdAt.toISOString(),
  };
}

export type DuetView = ReturnType<typeof duetView>;

export async function saveDuetReport(db: Db, duetId: string, r: { reason: (typeof duetReport.$inferInsert)["reason"]; details: string; email?: string }): Promise<void> {
  await db.insert(duetReport).values({ duetId, reason: r.reason, details: r.details, email: r.email ?? null });
}

// A route's answer for a refused step.
export function duetErrorResponse(err: unknown): Response {
  if (err instanceof DuetError) return Response.json({ error: err.message, needCredits: err.needCredits }, { status: err.status });
  throw err;
}
