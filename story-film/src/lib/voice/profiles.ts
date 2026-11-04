import { rm } from "node:fs/promises";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { voiceProfile } from "@/lib/db/schema";

export type VoiceProfile = typeof voiceProfile.$inferSelect;

export const MAX_VOICES = 3;

export async function saveVoice(db: Db, values: typeof voiceProfile.$inferInsert): Promise<VoiceProfile> {
  const [row] = await db.insert(voiceProfile).values(values).returning();
  return row;
}

// Voices are only ever usable by the account that recorded them.
export async function getVoice(db: Db, userId: string, id: string): Promise<VoiceProfile | undefined> {
  const [row] = await db.select().from(voiceProfile).where(and(eq(voiceProfile.id, id), eq(voiceProfile.userId, userId)));
  return row;
}

export async function listVoices(db: Db, userId: string): Promise<VoiceProfile[]> {
  return db.select().from(voiceProfile).where(eq(voiceProfile.userId, userId)).orderBy(desc(voiceProfile.createdAt));
}

// Deleting a voice removes the recording itself; songs already made stay.
export async function deleteVoice(db: Db, userId: string, id: string): Promise<boolean> {
  const [row] = await db.delete(voiceProfile).where(and(eq(voiceProfile.id, id), eq(voiceProfile.userId, userId))).returning();
  if (!row) return false;
  await rm(row.samplePath, { force: true });
  return true;
}

export function voiceView(v: VoiceProfile) {
  return { id: v.id, name: v.name, durationSec: v.durationSec, consentedAt: v.consentedAt.toISOString() };
}
