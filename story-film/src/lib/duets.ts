import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { SONG_CREDITS, TUNE_SONG_CREDITS } from "@/lib/billing/catalog";
import { grantCredits, spendCredits } from "@/lib/billing/credits";
import type { Db } from "@/lib/db";
import { duet, duetReport, song } from "@/lib/db/schema";
import { GIFT_TOKEN, newGiftToken } from "@/lib/gifts";
import { LANGUAGE_CODES } from "@/lib/languages";
import type { RemixCall } from "@/lib/songs/remix";

// Jugalbandi: A starts a duet and records a part with Hum it, B records theirs on their own phone
// (or on the invite page), and both parts are joined into one song on their tunes.
// Design: design/community/flow-spec.md (feature 2) and PLAN decision 43.

export type Duet = typeof duet.$inferSelect;
export type Role = "a" | "b";

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

// Where the duet is, worked out from its row (and its song's status) so nothing has to run on a timer.
export type Phase = "recording_a" | "waiting" | "expired" | "joining" | "join_failed" | "ready" | "declined" | "cancelled" | "solo";

export function phaseOf(d: Duet, songStatus: string | null | undefined, now = new Date()): Phase {
  if (d.status === "declined" || d.status === "cancelled" || d.status === "solo") return d.status;
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

export async function duetByToken(db: Db, token: string): Promise<Duet | undefined> {
  if (!DUET_TOKEN.test(token)) return undefined;
  const [row] = await db.select().from(duet).where(eq(duet.token, token));
  return row;
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
  if (role === "a") {
    return update(db, d.id, { partAPath: file, partAKind: kind, partAText: take.transcript.slice(0, 2000), partASec: sec, expiresAt: d.partBPath ? d.expiresAt : new Date(now.getTime() + DUET_WINDOW_MS) });
  }
  return update(db, d.id, { partBPath: file, partBKind: kind, partBText: take.transcript.slice(0, 2000), partBSec: sec });
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
  if (phaseOf(d, null) !== "waiting" || d.partBPath) throw new DuetError("This invite can't be declined now.");
  await refundPartner(db, d, "declined");
  return update(db, d.id, { status: "declined", partnerId: userId, declineNote: note.trim().slice(0, 140), paidB: 0 });
}

// A gives everything back and ends it (not while the song is being made).
export async function cancelDuet(db: Db, d: Duet): Promise<Duet> {
  const phase = phaseOf(d, await songStatusOf(db, d));
  if (phase === "joining" || phase === "solo" || phase === "cancelled") throw new DuetError("This Jugalbandi can't be cancelled now.");
  if (d.paidA > 0) await grantCredits(db, d.starterId, d.paidA, "refund", `duet-cancel:${d.id}`);
  await refundPartner(db, d, "cancel");
  return update(db, d.id, { status: "cancelled", paidA: 0, paidB: 0 });
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
  return update(db, d.id, {
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
  queue: (job: { songId: string; userId: string; title: string; call: RemixCall; credits: number }) => Promise<void>;
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
  const dir = path.resolve(deps.outputDir, "duets", d.id);
  const joined = path.join(dir, `joined-${now.getTime()}.mp3`);
  await deps.ffmpeg(joinArgs(d.partAPath, d.partBPath, joined));
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
  await deps.queue({ songId: row.id, userId: d.starterId, title, call, credits: 0 });
  // B's half covers half of A's: A gets that back on the first join.
  const splitBack = d.paidB > 0 && d.paidA === DUET_CREDITS;
  if (splitBack) await grantCredits(db, d.starterId, d.paidB, "refund", `duet-split:${d.id}`);
  return update(db, d.id, { songId: row.id, status: "joining", approvedA: null, approvedB: null, retakeAskedOf: null, ...(splitBack ? { paidA: DUET_CREDITS - d.paidB } : {}) });
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
  return update(db, d.id, { songId: row.id, status: "solo", paidA: SOLO_CREDITS, paidB: 0 });
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
    .where(or(eq(duet.starterId, userId), eq(duet.partnerId, userId)))
    .orderBy(desc(duet.createdAt))
    .limit(limit);
}

export function inviteUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/j/${token}`;
}

// What each person sees. Audio comes through routes that check who's asking.
export function duetView(d: Duet, role: Role, songStatus: string | null, baseUrl: string, now = new Date()) {
  const phase = phaseOf(d, songStatus, now);
  const mine = role === "a" ? d.retakesA : d.retakesB;
  return {
    id: d.id,
    role,
    phase,
    url: inviteUrl(baseUrl, d.token),
    topic: d.topic,
    genre: d.genre,
    language: d.language,
    starterName: d.starterName,
    partnerName: d.partnerName,
    starterIg: d.starterIg,
    partnerIg: d.partnerIg,
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
