import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { film, scheduledPost, socialAccount } from "@/lib/db/schema";
import { getFilm } from "@/lib/films";
import { accessTokenFor } from "@/lib/social-accounts";
import { YouTubeError, type YouTubeClient } from "@/lib/youtube";

export type Post = typeof scheduledPost.$inferSelect;

export const newPostSchema = z.object({
  filmId: z.uuid(),
  socialAccountId: z.uuid(),
  title: z.string().trim().min(1).max(100),
  description: z.string().max(5000).default(""),
  tags: z.array(z.string().trim().min(1).max(40)).max(15).default([]),
  privacy: z.enum(["public", "unlisted", "private"]).default("public"),
  madeForKids: z.boolean().optional(),
  // ISO timestamp; omitted means "publish now".
  scheduledAt: z.iso.datetime({ offset: true }).optional(),
});

export function postView(p: Post, extra?: { filmTitle?: string | null; accountName?: string }) {
  return {
    id: p.id,
    filmId: p.filmId,
    title: p.title,
    privacy: p.privacy,
    madeForKids: p.madeForKids,
    scheduledAt: p.scheduledAt.toISOString(),
    status: p.status,
    externalUrl: p.externalUrl,
    error: p.error,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    accountName: extra?.accountName ?? null,
  };
}

export async function createPost(db: Db, userId: string, input: z.infer<typeof newPostSchema>): Promise<Post> {
  const f = await getFilm(db, userId, input.filmId);
  if (!f || f.status !== "completed") throw new PostError("Only finished videos can be scheduled");
  const [account] = await db
    .select()
    .from(socialAccount)
    .where(and(eq(socialAccount.id, input.socialAccountId), eq(socialAccount.userId, userId)));
  if (!account) throw new PostError("Connect a YouTube channel first");
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : new Date();
  if (scheduledAt.getTime() > Date.now() + 90 * 24 * 3600 * 1000) throw new PostError("Schedule up to 90 days ahead");
  const [row] = await db
    .insert(scheduledPost)
    .values({
      userId,
      filmId: f.id,
      socialAccountId: account.id,
      title: input.title,
      description: input.description,
      tags: input.tags,
      privacy: input.privacy,
      // Kid-safe cartoons default to "made for kids" (YouTube/COPPA); the user can override.
      madeForKids: input.madeForKids ?? f.kidSafe,
      scheduledAt,
    })
    .returning();
  return row;
}

export async function listPosts(db: Db, userId: string, from: Date, to: Date) {
  return db
    .select({ post: scheduledPost, accountName: socialAccount.name })
    .from(scheduledPost)
    .innerJoin(socialAccount, eq(scheduledPost.socialAccountId, socialAccount.id))
    .where(and(eq(scheduledPost.userId, userId), gte(scheduledPost.scheduledAt, from), lt(scheduledPost.scheduledAt, to)))
    .orderBy(asc(scheduledPost.scheduledAt));
}

// Only posts that haven't started uploading can be cancelled.
export async function cancelPost(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(scheduledPost)
    .set({ status: "cancelled" })
    .where(and(eq(scheduledPost.id, id), eq(scheduledPost.userId, userId), inArray(scheduledPost.status, ["scheduled", "failed"])))
    .returning();
  return rows.length > 0;
}

// A failed post goes back to "scheduled" for right now.
export async function retryPost(db: Db, userId: string, id: string): Promise<Post | undefined> {
  const [row] = await db
    .update(scheduledPost)
    .set({ status: "scheduled", error: null, scheduledAt: new Date() })
    .where(and(eq(scheduledPost.id, id), eq(scheduledPost.userId, userId), eq(scheduledPost.status, "failed")))
    .returning();
  return row;
}

export async function pendingPosts(db: Db): Promise<Post[]> {
  return db.select().from(scheduledPost).where(eq(scheduledPost.status, "scheduled"));
}

export interface PublishDeps {
  db: Db;
  tokenKey: string;
  youtube: YouTubeClient;
}

// Runs in the worker when a post is due. Claims the post first so a duplicate
// job can never upload the same video twice.
export async function publishPost(deps: PublishDeps, postId: string): Promise<"published" | "skipped"> {
  const { db } = deps;
  const [claimed] = await db
    .update(scheduledPost)
    .set({ status: "publishing", error: null })
    .where(and(eq(scheduledPost.id, postId), eq(scheduledPost.status, "scheduled")))
    .returning();
  if (!claimed) return "skipped";

  try {
    const [row] = await db
      .select({ film, account: socialAccount })
      .from(film)
      .innerJoin(socialAccount, eq(socialAccount.id, claimed.socialAccountId))
      .where(eq(film.id, claimed.filmId));
    if (!row?.film.outputPath) throw new PostError("The video file is missing");

    const token = await accessTokenFor(db, deps.tokenKey, deps.youtube, row.account);
    const video = await deps.youtube.upload(token, row.film.outputPath, {
      title: claimed.title,
      description: claimed.description,
      tags: claimed.tags,
      privacy: claimed.privacy,
      madeForKids: claimed.madeForKids,
    });
    // Unaudited Google projects get uploads forced to private; surface that.
    const note = video.privacy !== claimed.privacy ? `YouTube set this video to ${video.privacy}` : null;
    await db
      .update(scheduledPost)
      .set({ status: "published", externalId: video.id, externalUrl: video.url, publishedAt: new Date(), error: note })
      .where(eq(scheduledPost.id, postId));
    return "published";
  } catch (err) {
    const message = err instanceof YouTubeError && err.needsReconnect ? "YouTube access was revoked. Reconnect the channel and try again." : (err as Error).message;
    await db.update(scheduledPost).set({ status: "failed", error: message.slice(0, 500) }).where(eq(scheduledPost.id, postId));
    throw err;
  }
}

export class PostError extends Error {}
