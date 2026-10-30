import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { film } from "@/lib/db/schema";

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
