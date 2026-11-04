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
    myVoice: Boolean(s.voiceProfileId),
    // A trimmed / faded / sped-up copy of another song.
    edited: Boolean(s.parentSongId && !s.voiceProfileId),
    contentCredentials: s.contentCredentials,
    error: s.error,
    createdAt: s.createdAt.toISOString(),
    audioUrl: s.status === "completed" ? `/api/songs/${s.id}/audio` : null,
  };
}

// Splits one song charge across its takes (4 credits, 2 takes -> [2, 2]; 5, 2 -> [3, 2]).
export function takeCredits(total: number, takes: number): number[] {
  return Array.from({ length: takes }, (_, i) => Math.floor(total / takes) + (i < total % takes ? 1 : 0));
}
