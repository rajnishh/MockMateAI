import { and, eq } from "drizzle-orm";
import { decrypt, encrypt } from "@/lib/crypto";
import type { Db } from "@/lib/db";
import { socialAccount } from "@/lib/db/schema";
import type { Channel, Tokens, YouTubeClient } from "@/lib/youtube";

export type SocialAccount = typeof socialAccount.$inferSelect;

export function accountView(a: SocialAccount) {
  return { id: a.id, platform: a.platform, name: a.name, imageUrl: a.imageUrl };
}

// Reconnecting the same channel updates its tokens instead of duplicating it.
export async function saveYouTubeAccount(db: Db, key: string, userId: string, channel: Channel, tokens: Tokens): Promise<SocialAccount> {
  if (!tokens.refreshToken) throw new Error("Google did not return a refresh token; remove the app's access in your Google account and connect again");
  const values = {
    name: channel.title,
    imageUrl: channel.imageUrl ?? null,
    accessToken: encrypt(tokens.accessToken, key),
    refreshToken: encrypt(tokens.refreshToken, key),
    expiresAt: tokens.expiresAt,
  };
  const [row] = await db
    .insert(socialAccount)
    .values({ userId, platform: "youtube", externalId: channel.id, ...values })
    .onConflictDoUpdate({ target: [socialAccount.userId, socialAccount.platform, socialAccount.externalId], set: values })
    .returning();
  return row;
}

export async function listAccounts(db: Db, userId: string): Promise<SocialAccount[]> {
  return db.select().from(socialAccount).where(eq(socialAccount.userId, userId));
}

export async function getAccount(db: Db, userId: string, id: string): Promise<SocialAccount | undefined> {
  const [row] = await db.select().from(socialAccount).where(and(eq(socialAccount.id, id), eq(socialAccount.userId, userId)));
  return row;
}

export async function deleteAccount(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db.delete(socialAccount).where(and(eq(socialAccount.id, id), eq(socialAccount.userId, userId))).returning();
  return rows.length > 0;
}

// Returns a usable access token, refreshing (and saving) it when it is about to expire.
export async function accessTokenFor(db: Db, key: string, yt: YouTubeClient, account: SocialAccount): Promise<string> {
  if (account.expiresAt.getTime() - Date.now() > 2 * 60 * 1000) return decrypt(account.accessToken, key);
  const fresh = await yt.refresh(decrypt(account.refreshToken, key));
  await db
    .update(socialAccount)
    .set({
      accessToken: encrypt(fresh.accessToken, key),
      expiresAt: fresh.expiresAt,
      ...(fresh.refreshToken ? { refreshToken: encrypt(fresh.refreshToken, key) } : {}),
    })
    .where(eq(socialAccount.id, account.id));
  return fresh.accessToken;
}
