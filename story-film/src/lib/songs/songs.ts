import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { song } from "@/lib/db/schema";

export type Song = typeof song.$inferSelect;

export async function createSong(db: Db, values: typeof song.$inferInsert): Promise<Song> {
  const [row] = await db.insert(song).values(values).returning();
  return row;
}

export async function updateSong(db: Db, id: string, values: Partial<typeof song.$inferInsert>): Promise<void> {
  await db.update(song).set(values).where(eq(song.id, id));
}

export async function getSong(db: Db, userId: string, id: string): Promise<Song | undefined> {
  const [row] = await db.select().from(song).where(and(eq(song.id, id), eq(song.userId, userId)));
  return row;
}

export async function listSongs(db: Db, userId: string, limit = 50): Promise<Song[]> {
  return db.select().from(song).where(eq(song.userId, userId)).orderBy(desc(song.createdAt)).limit(limit);
}

export function songView(s: Song) {
  return {
    id: s.id,
    title: s.title,
    genre: s.genre,
    mood: s.mood,
    language: s.language,
    lyrics: s.lyrics,
    durationSec: s.durationSec,
    status: s.status,
    error: s.error,
    createdAt: s.createdAt.toISOString(),
    audioUrl: s.status === "completed" ? `/api/songs/${s.id}/audio` : null,
  };
}
