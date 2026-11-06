import { createHash } from "node:crypto";
import { and, desc, eq, isNull, notExists, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { creatorProfile, duet, duetReport, gift, giftReport, giftReportReason, recipe, recipeReport, song, songReport, user, userBlock } from "@/lib/db/schema";
import { sendNotice } from "@/lib/email";

// User-generated content rules (App Review 1.2, India's IT Rules): blocking people, per-viewer
// filtering, and hiding a song, recipe, gift or duet automatically once reports pile up.
//
// Auto-hide sets `hidden_at`, not `taken_down_at`. taken_down_at stays the owner's decision after a
// review (a taken-down song can't be published again; a taken-down recipe drops pending earnings),
// while a pile of reports can be wrong or organised. Hidden is the same as taken down for everyone
// else until a person reviews it, then clears hidden_at (not upheld) or sets taken_down_at (upheld).

// ---------- Block ----------

// SQL: the row's creator (`userCol`) isn't someone this viewer blocked.
export function notBlockedBy(viewerId: string | undefined, userCol: AnyPgColumn): SQL | undefined {
  return viewerId ? notExists(sql`(select 1 from ${userBlock} where ${userBlock.blockerId} = ${viewerId} and ${userBlock.blockedId} = ${userCol})`) : undefined;
}

// SQL: a song this viewer hasn't reported.
export function songNotReportedBy(viewerId: string | undefined): SQL | undefined {
  return viewerId ? notExists(sql`(select 1 from ${songReport} where ${songReport.songId} = ${song.id} and ${songReport.reporterId} = ${viewerId})`) : undefined;
}

// Songs a viewer should see in lists: not by someone they blocked, not one they reported.
export function songVisibleTo(viewerId: string | undefined): SQL | undefined {
  return viewerId ? and(notBlockedBy(viewerId, song.userId), songNotReportedBy(viewerId)) : undefined;
}

// The same for lists built in memory (the remix family tree).
export interface ViewerHides {
  users: Set<string>;
  songs: Set<string>;
}

export async function viewerHides(db: Db, viewerId: string | undefined): Promise<ViewerHides> {
  if (!viewerId) return { users: new Set(), songs: new Set() };
  const [blocks, reports] = await Promise.all([
    db.select({ id: userBlock.blockedId }).from(userBlock).where(eq(userBlock.blockerId, viewerId)),
    db.select({ id: songReport.songId }).from(songReport).where(eq(songReport.reporterId, viewerId)),
  ]);
  return { users: new Set(blocks.map((b) => b.id)), songs: new Set(reports.map((r) => r.id)) };
}

export async function isBlocked(db: Db, blockerId: string, blockedId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: userBlock.blockedId })
    .from(userBlock)
    .where(and(eq(userBlock.blockerId, blockerId), eq(userBlock.blockedId, blockedId)))
    .limit(1);
  return Boolean(row);
}

// Who to block: a creator's @handle (songs, recipes), the sender of a gift (its token), or the other
// person in a Jugalbandi (its id), since gift senders and duet partners may have no handle.
export const blockSchema = z
  .object({
    handle: z.string().trim().max(40).optional(),
    gift: z.string().trim().max(40).optional(),
    duet: z.string().trim().max(40).optional(),
  })
  .refine((v) => [v.handle, v.gift, v.duet].filter(Boolean).length === 1, "Say who to block: a handle, a gift or a duet.");

export async function blockTarget(db: Db, blockerId: string, t: z.infer<typeof blockSchema>): Promise<{ userId: string } | { error: string; status: number }> {
  if (t.handle) {
    const [p] = await db.select({ userId: creatorProfile.userId }).from(creatorProfile).where(eq(creatorProfile.handle, t.handle.replace(/^@/, "").toLowerCase()));
    return p ? { userId: p.userId } : { error: "We couldn't find that creator.", status: 404 };
  }
  if (t.gift) {
    const [g] = await db.select({ senderId: gift.senderId }).from(gift).where(eq(gift.token, t.gift));
    return g ? { userId: g.senderId } : { error: "We couldn't find that gift.", status: 404 };
  }
  if (!/^[0-9a-f-]{36}$/.test(t.duet ?? "")) return { error: "We couldn't find that Jugalbandi.", status: 404 };
  const [d] = await db.select().from(duet).where(eq(duet.id, t.duet!));
  if (!d) return { error: "We couldn't find that Jugalbandi.", status: 404 };
  const other = d.starterId === blockerId ? d.partnerId : d.partnerId === blockerId || d.invitedUserId === blockerId ? d.starterId : null;
  return other ? { userId: other } : { error: "There's no one to block in this Jugalbandi yet.", status: 400 };
}

export async function blockUser(db: Db, blockerId: string, blockedId: string): Promise<{ ok: true } | { error: string; status: number }> {
  if (blockerId === blockedId) return { error: "You can't block yourself.", status: 400 };
  await db.insert(userBlock).values({ blockerId, blockedId }).onConflictDoNothing();
  return { ok: true };
}

export async function unblockUser(db: Db, blockerId: string, blockedId: string): Promise<void> {
  await db.delete(userBlock).where(and(eq(userBlock.blockerId, blockerId), eq(userBlock.blockedId, blockedId)));
}

// Settings > Blocked creators: the @handle when they have one, else their account name.
export async function listBlocks(db: Db, blockerId: string) {
  const rows = await db
    .select({ userId: userBlock.blockedId, handle: creatorProfile.handle, name: user.name, createdAt: userBlock.createdAt })
    .from(userBlock)
    .innerJoin(user, eq(user.id, userBlock.blockedId))
    .leftJoin(creatorProfile, eq(creatorProfile.userId, userBlock.blockedId))
    .where(eq(userBlock.blockerId, blockerId))
    .orderBy(desc(userBlock.createdAt));
  return rows.map((r) => ({ userId: r.userId, handle: r.handle ?? null, name: r.handle ? `@${r.handle}` : r.name, createdAt: r.createdAt.toISOString() }));
}

// ---------- Reports and auto-hide ----------

export type ReportKind = "song" | "recipe" | "gift" | "duet";

export const reportInputSchema = z.object({
  reason: z.enum(giftReportReason.enumValues),
  details: z.string().trim().max(500).default(""),
  email: z.string().trim().email().max(200).optional().or(z.literal("").transform(() => undefined)),
});
export type ReportInput = z.infer<typeof reportInputSchema>;

// Reports from this many different people hide it; one report of sexual content involving a minor does.
export const AUTO_HIDE_REPORTERS = 3;

// "u:{userId}" when signed in, else a hash of the IP (never the IP itself), so one person sending
// three reports doesn't count as three people.
export function reporterKey(r: { userId?: string; ip?: string }): string | null {
  if (r.userId) return `u:${r.userId}`;
  if (r.ip) return `ip:${createHash("sha256").update(`reelkar-report:${r.ip}`).digest("hex").slice(0, 20)}`;
  return null;
}

export interface HideAlert {
  kind: ReportKind;
  id: string;
  // The public page: /s/{publicId}, /r/{publicId}, /g/{token} or /j/{token}.
  path: string;
  reporters: number;
  minorSexual: boolean;
}

const TABLES = {
  song: { report: songReport, subject: songReport.songId },
  recipe: { report: recipeReport, subject: recipeReport.recipeId },
  gift: { report: giftReport, subject: giftReport.giftId },
  duet: { report: duetReport, subject: duetReport.duetId },
} as const;

// Saves a report, then hides the item when it has crossed the line, and tells the team once.
export async function fileReport(
  db: Db,
  kind: ReportKind,
  subjectId: string,
  input: ReportInput,
  reporter: { userId?: string; ip?: string },
  alert: (a: HideAlert) => Promise<void> | void = logAlert,
  now = new Date(),
): Promise<{ hidden: boolean }> {
  const base = { reason: input.reason, details: input.details, email: input.email ?? null, reporterId: reporter.userId ?? null, reporterKey: reporterKey(reporter) };
  if (kind === "song") await db.insert(songReport).values({ ...base, songId: subjectId });
  else if (kind === "recipe") await db.insert(recipeReport).values({ ...base, recipeId: subjectId });
  else if (kind === "gift") await db.insert(giftReport).values({ ...base, giftId: subjectId });
  else await db.insert(duetReport).values({ ...base, duetId: subjectId });

  const t = TABLES[kind];
  const [c] = await db
    .select({
      reporters: sql<number>`count(distinct ${t.report.reporterKey})::int`,
      minor: sql<boolean>`coalesce(bool_or(${t.report.reason} = 'minor_sexual'), false)`,
    })
    .from(t.report)
    .where(eq(t.subject, subjectId));
  const reporters = Number(c?.reporters ?? 0);
  const minorSexual = Boolean(c?.minor);
  if (reporters < AUTO_HIDE_REPORTERS && !minorSexual) return { hidden: false };

  const path = await hide(db, kind, subjectId, now);
  if (!path) return { hidden: false };
  try {
    await alert({ kind, id: subjectId, path, reporters, minorSexual });
  } catch (err) {
    console.error(`[reports] alert for ${kind} ${subjectId} failed:`, (err as Error).message);
  }
  return { hidden: true };
}

// Sets hidden_at once (not when it's already hidden or taken down); the public path, or null if nothing changed.
async function hide(db: Db, kind: ReportKind, id: string, now: Date): Promise<string | null> {
  if (kind === "song") {
    const [r] = await db.update(song).set({ hiddenAt: now }).where(and(eq(song.id, id), isNull(song.hiddenAt), isNull(song.takenDownAt))).returning({ p: song.publicId });
    return r ? `/s/${r.p}` : null;
  }
  if (kind === "recipe") {
    const [r] = await db.update(recipe).set({ hiddenAt: now }).where(and(eq(recipe.id, id), isNull(recipe.hiddenAt), isNull(recipe.takenDownAt))).returning({ p: recipe.publicId });
    return r ? `/r/${r.p}` : null;
  }
  if (kind === "gift") {
    const [r] = await db.update(gift).set({ hiddenAt: now }).where(and(eq(gift.id, id), isNull(gift.hiddenAt), isNull(gift.takenDownAt))).returning({ p: gift.token });
    return r ? `/g/${r.p}` : null;
  }
  const [r] = await db.update(duet).set({ hiddenAt: now }).where(and(eq(duet.id, id), isNull(duet.hiddenAt))).returning({ p: duet.token });
  return r ? `/j/${r.p}` : null;
}

export function alertText(a: HideAlert): { subject: string; text: string } {
  const why = a.minorSexual ? "a report of sexual content involving a minor" : `reports from ${a.reporters} different people`;
  return {
    subject: `Reelkar: a ${a.kind} was hidden after reports`,
    text:
      `A ${a.kind} (${a.id}, ${a.path}) was hidden automatically after ${why}.\n\n` +
      `Review it within 24 hours. Not upheld: clear ${a.kind}.hidden_at to bring it back. Upheld: set ${a.kind === "duet" ? "nothing more (it stays hidden)" : `${a.kind}.taken_down_at`}, and block repeat offenders.`,
  };
}

function logAlert(a: HideAlert): void {
  console.warn(`[reports] ${alertText(a).text.split("\n")[0]}`);
}

// The routes' alert: always the server log, plus an email to REPORTS_EMAIL when Resend is set up.
export function ownerAlert(env: { REPORTS_EMAIL?: string; RESEND_API_KEY?: string; EMAIL_FROM?: string }, fetchFn: typeof fetch = fetch) {
  return async (a: HideAlert) => {
    logAlert(a);
    if (!env.REPORTS_EMAIL || !env.RESEND_API_KEY || !env.EMAIL_FROM) return;
    const { subject, text } = alertText(a);
    await sendNotice({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM }, env.REPORTS_EMAIL, subject, text, fetchFn);
  };
}

// ---------- Gifts and duets reaching the blocker ----------

// SQL for gift rows (replies in the Inbox): not from someone this viewer blocked or a gift they reported.
export function giftVisibleTo(viewerId: string): SQL | undefined {
  return and(
    notBlockedBy(viewerId, gift.senderId),
    notExists(sql`(select 1 from ${giftReport} where ${giftReport.giftId} = ${gift.id} and ${giftReport.reporterId} = ${viewerId})`),
  );
}

// SQL for an invite that hasn't been joined: hidden when the viewer blocked its starter or reported it.
export function duetInviteVisibleTo(viewerId: string): SQL | undefined {
  return and(
    notBlockedBy(viewerId, duet.starterId),
    notExists(sql`(select 1 from ${duetReport} where ${duetReport.duetId} = ${duet.id} and ${duetReport.reporterId} = ${viewerId})`),
    isNull(duet.hiddenAt),
  );
}
