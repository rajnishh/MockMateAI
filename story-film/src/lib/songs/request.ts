import { z } from "zod";
import { LANGUAGE_CODES } from "@/lib/languages";
import type { SongLanguage } from "./lyrics";
import { MOODS } from "./styles";

export const songOptionsSchema = z.object({
  topic: z.string().trim().min(3).max(300),
  genre: z.string(),
  mood: z.enum(MOODS).or(z.literal("")).default(""),
  language: z.enum([...LANGUAGE_CODES, "hinglish"]).default("hi"),
  durationSec: z.union([z.literal(30), z.literal(60), z.literal(120)]).default(60),
  kidSafe: z.boolean().default(false),
});

export const newSongSchema = songOptionsSchema.extend({
  title: z.string().trim().min(1).max(80),
  lyrics: z.string().trim().min(20).max(3000),
});

// ACE-Step's vocal language: Hinglish lyrics are mostly Hindi words.
export function vocalLanguage(language: SongLanguage): string {
  return language === "hinglish" ? "hi" : language;
}
