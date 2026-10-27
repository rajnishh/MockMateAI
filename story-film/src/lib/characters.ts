import { randomInt, randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
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

export async function createCharacter(
  image: ImageProvider,
  input: z.infer<typeof newCharacterSchema>,
): Promise<Character> {
  const seed = randomInt(1, 2 ** 31 - 1);
  const ref = await image.generateKeyframe({ prompt: referenceSheetPrompt(input), referenceImageUrls: [], seed });
  return { id: randomUUID(), ...input, referenceImageUrl: ref.url, seed, createdAt: new Date().toISOString() };
}

// Phase 0 keeps characters in Redis (one hash per user); Phase 1 moves them to the database.
export class CharacterStore {
  constructor(private readonly redis: Redis) {}

  private key(userId: string) {
    return `characters:${userId}`;
  }

  async save(userId: string, c: Character): Promise<void> {
    await this.redis.hset(this.key(userId), c.id, JSON.stringify(c));
  }

  async get(userId: string, id: string): Promise<Character | undefined> {
    const raw = await this.redis.hget(this.key(userId), id);
    return raw ? (JSON.parse(raw) as Character) : undefined;
  }

  async list(userId: string): Promise<Character[]> {
    const all = Object.values(await this.redis.hgetall(this.key(userId))).map((r) => JSON.parse(r) as Character);
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}
