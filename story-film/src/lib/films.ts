import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, inArray, ne, notExists } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { film, scheduledPost } from "@/lib/db/schema";

export type Film = typeof film.$inferSelect;
export type NewFilm = typeof film.$inferInsert;

export async function createFilm(db: Db, values: NewFilm): Promise<Film> {
  const [row] = await db.insert(film).values(values).returning();
  return row;
}

export async function updateFilm(db: Db, id: string, values: Partial<NewFilm>): Promise<void> {
  await db.update(film).set(values).where(eq(film.id, id));
}

// Changes the film only if it is still in the expected status; false when something else changed it first.
export async function updateFilmIf(db: Db, id: string, status: Film["status"], values: Partial<NewFilm>): Promise<boolean> {
  const rows = await db.update(film).set(values).where(and(eq(film.id, id), eq(film.status, status))).returning({ id: film.id });
  return rows.length > 0;
}

// Always scoped by user so one user can never read another's film.
export async function getFilm(db: Db, userId: string, id: string): Promise<Film | undefined> {
  const [row] = await db.select().from(film).where(and(eq(film.id, id), eq(film.userId, userId)));
  return row;
}

export async function listFilms(db: Db, userId: string, limit = 50): Promise<Film[]> {
  return db.select().from(film).where(eq(film.userId, userId)).orderBy(desc(film.createdAt)).limit(limit);
}

// A reel the worker is still making, or one being uploaded to a platform right now, stays until it settles.
const DELETABLE: Film["status"][] = ["completed", "failed", "review"];

export type DeleteResult = "deleted" | "not_found" | "busy";

// Removes the creator's own reel, its scheduled posts (ON DELETE CASCADE) and its files:
// OUTPUT_DIR/<id>/ from the worker and OUTPUT_DIR/uploads/<id>.<ext> from an edit upload.
export async function deleteFilm(db: Db, userId: string, id: string, outputDir: string): Promise<DeleteResult> {
  const row = await getFilm(db, userId, id).catch(() => undefined);
  if (!row) return "not_found";
  if (!DELETABLE.includes(row.status)) return "busy";
  // One statement, so a post the publisher claims meanwhile still keeps the reel.
  const uploading = db
    .select({ id: scheduledPost.id })
    .from(scheduledPost)
    .where(and(eq(scheduledPost.filmId, film.id), eq(scheduledPost.status, "publishing")));
  const gone = await db
    .delete(film)
    .where(and(eq(film.id, id), eq(film.userId, userId), inArray(film.status, DELETABLE), notExists(uploading)))
    .returning({ id: film.id });
  if (!gone.length) return "busy";
  // The id came from the database (a UUID), never straight from the request.
  await rm(path.resolve(outputDir, row.id), { recursive: true, force: true });
  const uploads = path.resolve(outputDir, "uploads");
  const sources = await readdir(uploads).catch(() => [] as string[]);
  await Promise.all(sources.filter((f) => f.startsWith(`${row.id}.`)).map((f) => rm(path.join(uploads, f), { force: true })));
  return "deleted";
}

// A cartoon series is every film made with one character (failed ones never aired); newest first,
// for "suggest the next episode".
export async function seriesEpisodes(db: Db, userId: string, characterId: string, limit = 5): Promise<string[]> {
  const rows = await db
    .select({ title: film.title, story: film.story })
    .from(film)
    .where(and(eq(film.userId, userId), eq(film.characterId, characterId), ne(film.status, "failed")))
    .orderBy(desc(film.createdAt))
    .limit(limit);
  return rows.map((r) => (r.title ? `${r.title}: ${r.story}` : r.story).slice(0, 240));
}

// What the browser sees; internal paths stay server-side.
export function filmView(f: Film) {
  return {
    id: f.id,
    status: f.status,
    stage: f.stage,
    title: f.title,
    story: f.story,
    kidSafe: f.kidSafe,
    quality: f.quality,
    format: f.format,
    songId: f.songId,
    contentCredentials: f.contentCredentials,
    credits: f.credits,
    error: f.error,
    createdAt: f.createdAt.toISOString(),
    videoUrl: f.status === "completed" ? `/api/films/${f.id}/video` : null,
  };
}
