import { randomInt, randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { character } from "@/lib/db/schema";
import { z } from "zod";
import { STYLE_HINTS } from "@/lib/pipeline/script";
import type { CharacterProfile, FilmStyle, ImageProvider } from "@/lib/providers/types";

export const newCharacterSchema = z.object({
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().min(10).max(300),
  style: z.enum(["cinematic", "animated", "photoreal"]).default("animated"),
});

export interface Character extends CharacterProfile {
  id: string;
  style: FilmStyle;
  createdAt: string;
}

export function referenceSheetPrompt(c: { name: string; description: string; style: FilmStyle }): string {
  return `${c.name}, ${c.description}, full body character reference, front view, neutral pose, plain light background, ${STYLE_HINTS[c.style]}`;
}

// Draws the reference sheet; the caller saves the result.
export async function createCharacter(
  image: ImageProvider,
  input: z.infer<typeof newCharacterSchema>,
): Promise<Omit<Character, "createdAt">> {
  const seed = randomInt(1, 2 ** 31 - 1);
  const ref = await image.generateKeyframe({ prompt: referenceSheetPrompt(input), referenceImageUrls: [], seed });
  return { id: randomUUID(), ...input, referenceImageUrl: ref.url, seed };
}

export async function saveCharacter(db: Db, userId: string, c: Omit<Character, "createdAt">): Promise<Character> {
  const [row] = await db.insert(character).values({ ...c, userId }).returning();
  return toCharacter(row);
}

// Always scoped by user so one user can never use another's character.
export async function getCharacter(db: Db, userId: string, id: string): Promise<Character | undefined> {
  const [row] = await db.select().from(character).where(and(eq(character.id, id), eq(character.userId, userId)));
  return row && toCharacter(row);
}

export async function listCharacters(db: Db, userId: string): Promise<Character[]> {
  const rows = await db.select().from(character).where(eq(character.userId, userId)).orderBy(asc(character.createdAt));
  return rows.map(toCharacter);
}

function toCharacter(row: typeof character.$inferSelect): Character {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    style: row.style,
    referenceImageUrl: row.referenceImageUrl,
    seed: row.seed,
    createdAt: row.createdAt.toISOString(),
  };
}
