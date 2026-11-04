import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { apiToken } from "@/lib/db/schema";

// Personal access keys for AI assistants. The key is shown once; only its hash is kept.
export const MAX_TOKENS = 10;
const PREFIX = "rk_";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createToken(db: Db, userId: string, name: string, timeZone: string) {
  const token = PREFIX + randomBytes(24).toString("base64url");
  const [row] = await db.insert(apiToken).values({ userId, name, tokenHash: hash(token), hint: token.slice(-4), timeZone }).returning();
  return { token, view: tokenView(row) };
}

export function tokenView(t: typeof apiToken.$inferSelect) {
  return { id: t.id, name: t.name, hint: t.hint, createdAt: t.createdAt.toISOString(), lastUsedAt: t.lastUsedAt?.toISOString() ?? null };
}

export async function listTokens(db: Db, userId: string) {
  return (await db.select().from(apiToken).where(eq(apiToken.userId, userId)).orderBy(desc(apiToken.createdAt))).map(tokenView);
}

export async function revokeToken(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db.delete(apiToken).where(and(eq(apiToken.id, id), eq(apiToken.userId, userId))).returning({ id: apiToken.id });
  return rows.length > 0;
}

// The creator a key belongs to, or null. Marks the key as used.
export async function tokenOwner(db: Db, token: string): Promise<{ userId: string; timeZone: string } | null> {
  if (!token.startsWith(PREFIX)) return null;
  const [row] = await db.select().from(apiToken).where(eq(apiToken.tokenHash, hash(token)));
  if (!row) return null;
  await db.update(apiToken).set({ lastUsedAt: new Date() }).where(eq(apiToken.id, row.id));
  return { userId: row.userId, timeZone: row.timeZone };
}
