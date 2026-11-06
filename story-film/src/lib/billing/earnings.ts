import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { creatorEarning, creditBalance, creditLedger } from "@/lib/db/schema";
import { EARN_RATE_BP } from "./catalog";

// Creator earnings, one model for remixes and reel recipes (design/community/remix-spec.md,
// "Earnings (shared with recipes)"). A source is "remix" or "recipe"; everything here works the
// same for both, and each source only says what its refs mean:
//   remix:  sourceRef = the remix song id, subjectRef = the parent song id
//   recipe: sourceRef = the reel (film) id, subjectRef = the recipe id
//
// 1. When the payer is charged, startEarning() saves a pending row with the charge, the share of
//    the payer's credits that were paid for (paidRatioBp, see below), the rate (EARN_RATE_BP) and
//    the hundredths of a credit that makes. Nothing is saved when the earner is the payer.
// 2. When the remix or reel finishes, settleEarning() marks it earned and adds its hundredths to the
//    earner's running total on credit_balance. Whole credits go into the balance as the total
//    passes them (ledger reason "earning", ref "earning:{id}"), never taken back.
// 3. When it fails (and the payer is refunded), dropEarning() marks it dropped: it never earns.
//
// Hundredths become credits by the floor of the running total: after every settle,
// earned_credited = floor(earned_hundredths / 100). Ten remixes earning 10 each add one credit, on
// the tenth; the leftover (earned_hundredths - earned_credited * 100) shows as "on the way".

export type EarningSource = (typeof creatorEarning.$inferSelect)["source"];
export type CreatorEarning = typeof creatorEarning.$inferSelect;

// Paid credits come in as purchases and plan credits; free ones as grants (welcome credits) and
// earnings, so spending earned credits never earns again. Refunds are left out.
const PAID_IN = ["purchase", "subscription"] as const;
const FREE_IN = ["grant", "earning"] as const;

// paidIn / (paidIn + freeIn) in basis points, rounded down; 0 when nothing came in.
export function ratioBp(paidIn: number, freeIn: number): number {
  const total = paidIn + freeIn;
  return total > 0 ? Math.floor((paidIn * 10_000) / total) : 0;
}

// The share of everything this person was ever given that they paid for, over their whole ledger.
export async function paidRatioBp(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({
      paid: sql<number>`coalesce(sum(${creditLedger.delta}) filter (where ${inArray(creditLedger.reason, [...PAID_IN])}), 0)::int`,
      all: sql<number>`coalesce(sum(${creditLedger.delta}), 0)::int`,
    })
    .from(creditLedger)
    .where(and(eq(creditLedger.userId, userId), sql`${creditLedger.delta} > 0`, inArray(creditLedger.reason, [...PAID_IN, ...FREE_IN])));
  const paid = Number(row?.paid ?? 0);
  return ratioBp(paid, Number(row?.all ?? 0) - paid);
}

// floor(charged × ratio × rate), in hundredths: 1 credit, all paid, 10% -> 10 (0.1 credit).
export function earningHundredths(charged: number, paidRatio: number, rateBp = EARN_RATE_BP): number {
  return Math.floor((charged * paidRatio * rateBp) / 1_000_000);
}

export interface NewEarning {
  source: EarningSource;
  sourceRef: string;
  subjectRef: string;
  earnerId: string;
  payerId: string;
  charged: number;
}

// Saves the pending earning at charge time, with the payer's paid share as it is now. Rows that
// earn 0 are kept too, so the earner's history can say "Free credits, nothing earned".
// Returns null (and saves nothing) when someone would earn from themselves.
export async function startEarning(db: Db, e: NewEarning, rateBp = EARN_RATE_BP): Promise<CreatorEarning | null> {
  if (e.earnerId === e.payerId) return null;
  const paid = await paidRatioBp(db, e.payerId);
  const [row] = await db
    .insert(creatorEarning)
    .values({
      userId: e.earnerId,
      source: e.source,
      sourceRef: e.sourceRef,
      subjectRef: e.subjectRef,
      payerUserId: e.payerId,
      charged: e.charged,
      paidRatioBp: paid,
      rateBp,
      hundredths: earningHundredths(e.charged, paid, rateBp),
    })
    .onConflictDoNothing({ target: [creatorEarning.source, creatorEarning.sourceRef] })
    .returning();
  return row ?? null;
}

// The remix or reel finished: the earning counts, and any whole credits it completes go into the
// earner's balance, all in one transaction. Returns null when there was nothing pending.
export async function settleEarning(db: Db, source: EarningSource, sourceRef: string, now = new Date()): Promise<{ earning: CreatorEarning; credited: number } | null> {
  return db.transaction(async (tx) => {
    const [e] = await tx
      .update(creatorEarning)
      .set({ status: "earned", settledAt: now })
      .where(and(eq(creatorEarning.source, source), eq(creatorEarning.sourceRef, sourceRef), eq(creatorEarning.status, "pending")))
      .returning();
    if (!e) return null;
    if (e.hundredths <= 0) return { earning: e, credited: 0 };
    // The row lock from this update keeps two settles for one earner from both granting the same credit.
    const [b] = await tx
      .insert(creditBalance)
      .values({ userId: e.userId, balance: 0, earnedHundredths: e.hundredths })
      .onConflictDoUpdate({ target: creditBalance.userId, set: { earnedHundredths: sql`${creditBalance.earnedHundredths} + ${e.hundredths}`, updatedAt: now } })
      .returning();
    const whole = Math.floor(b.earnedHundredths / 100) - b.earnedCredited;
    if (whole > 0) {
      await tx.insert(creditLedger).values({ userId: e.userId, delta: whole, reason: "earning", ref: `earning:${e.id}` });
      await tx
        .update(creditBalance)
        .set({ balance: sql`${creditBalance.balance} + ${whole}`, earnedCredited: sql`${creditBalance.earnedCredited} + ${whole}` })
        .where(eq(creditBalance.userId, e.userId));
    }
    return { earning: e, credited: Math.max(0, whole) };
  });
}

// It failed and was refunded, or its subject was taken down: a pending earning never counts.
export async function dropEarning(db: Db, source: EarningSource, sourceRef: string, now = new Date()): Promise<boolean> {
  const rows = await db
    .update(creatorEarning)
    .set({ status: "dropped", settledAt: now })
    .where(and(eq(creatorEarning.source, source), eq(creatorEarning.sourceRef, sourceRef), eq(creatorEarning.status, "pending")))
    .returning({ id: creatorEarning.id });
  return rows.length > 0;
}

// ---------- What the Earnings screen reads ----------

// What a source says about its subjects (a song's or recipe's title and cover) and its events (who
// remixed, what kind). Each source passes its own; GET /api/me/earnings joins them in.
export interface SubjectInfo {
  title: string;
  coverUrl: string | null;
  // The subject's public page, if it has one.
  publicId: string | null;
}
export type DescribeSubjects = (db: Db, refs: string[]) => Promise<Map<string, SubjectInfo>>;

export async function earningTotals(db: Db, userId: string) {
  const [b] = await db.select({ h: creditBalance.earnedHundredths, c: creditBalance.earnedCredited }).from(creditBalance).where(eq(creditBalance.userId, userId));
  const total = b?.h ?? 0;
  const credited = b?.c ?? 0;
  return { totalHundredths: total, credited, onTheWay: total - credited * 100 };
}

// Earned totals per song or recipe, highest first. `source` narrows it for the Remixes / Recipes chips.
export async function earningsBySubject(db: Db, userId: string, source?: EarningSource, describe: Partial<Record<EarningSource, DescribeSubjects>> = {}) {
  const hundredths = sql<number>`sum(${creatorEarning.hundredths})::int`;
  const rows = await db
    .select({ source: creatorEarning.source, subjectRef: creatorEarning.subjectRef, count: sql<number>`count(*)::int`, hundredths, last: sql<string>`max(${creatorEarning.settledAt})` })
    .from(creatorEarning)
    .where(and(eq(creatorEarning.userId, userId), eq(creatorEarning.status, "earned"), source ? eq(creatorEarning.source, source) : undefined))
    .groupBy(creatorEarning.source, creatorEarning.subjectRef)
    .orderBy(desc(hundredths), desc(sql`max(${creatorEarning.settledAt})`))
    .limit(200);
  const info = new Map<string, SubjectInfo>();
  for (const s of new Set(rows.map((r) => r.source))) {
    const fn = describe[s];
    if (!fn) continue;
    for (const [ref, v] of await fn(
      db,
      rows.filter((r) => r.source === s).map((r) => r.subjectRef),
    ))
      info.set(`${s}:${ref}`, v);
  }
  return rows.map((r) => {
    const i = info.get(`${r.source}:${r.subjectRef}`);
    return { source: r.source, subjectRef: r.subjectRef, title: i?.title ?? null, coverUrl: i?.coverUrl ?? null, publicId: i?.publicId ?? null, count: Number(r.count), hundredths: Number(r.hundredths) };
  });
}

export const EARNING_PAGE = 50;

// One song's or recipe's earned events, newest first, EARNING_PAGE at a time (`before` is the
// last row's `at`). `free` means the payer had only free credits, so it earned nothing.
export async function earningEvents(db: Db, userId: string, subjectRef: string, before?: Date) {
  const rows = await db
    .select()
    .from(creatorEarning)
    .where(and(eq(creatorEarning.userId, userId), eq(creatorEarning.subjectRef, subjectRef), eq(creatorEarning.status, "earned"), before ? lt(creatorEarning.settledAt, before) : undefined))
    .orderBy(desc(creatorEarning.settledAt))
    .limit(EARNING_PAGE + 1);
  const page = rows.slice(0, EARNING_PAGE);
  return {
    events: page.map((r) => ({ source: r.source, sourceRef: r.sourceRef, at: (r.settledAt ?? r.createdAt).toISOString(), hundredths: r.hundredths, free: r.paidRatioBp === 0 })),
    cursor: rows.length > EARNING_PAGE ? page[page.length - 1].settledAt!.toISOString() : null,
  };
}
