import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { creditBalance, creditLedger } from "@/lib/db/schema";

type Reason = (typeof creditLedger.$inferInsert)["reason"];

export async function getBalance(db: Db, userId: string): Promise<number> {
  const [row] = await db.select().from(creditBalance).where(eq(creditBalance.userId, userId));
  return row?.balance ?? 0;
}

// Adds credits once per (reason, ref). Returns false if that ref was already applied.
export async function grantCredits(db: Db, userId: string, delta: number, reason: Reason, ref: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(creditLedger)
      .values({ userId, delta, reason, ref })
      .onConflictDoNothing({ target: [creditLedger.reason, creditLedger.ref] })
      .returning({ id: creditLedger.id });
    if (!inserted.length) return false;
    await tx
      .insert(creditBalance)
      .values({ userId, balance: delta })
      .onConflictDoUpdate({ target: creditBalance.userId, set: { balance: sql`${creditBalance.balance} + ${delta}`, updatedAt: new Date() } });
    return true;
  });
}

// Charges credits atomically; false (and nothing charged) if the balance is too low.
export async function spendCredits(db: Db, userId: string, amount: number, ref: string, reason: "video" | "song" = "video"): Promise<boolean> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(creditBalance)
      .set({ balance: sql`${creditBalance.balance} - ${amount}`, updatedAt: new Date() })
      .where(and(eq(creditBalance.userId, userId), gte(creditBalance.balance, amount)))
      .returning({ balance: creditBalance.balance });
    if (!updated.length) return false;
    await tx.insert(creditLedger).values({ userId, delta: -amount, reason, ref });
    return true;
  });
}

export async function recentLedger(db: Db, userId: string, limit = 20) {
  return db.select().from(creditLedger).where(eq(creditLedger.userId, userId)).orderBy(desc(creditLedger.createdAt)).limit(limit);
}
