import { z } from "zod";
import { LANGUAGE_CODES } from "@/lib/languages";
import type { SongLanguage } from "./lyrics";
import { MOODS, VOCALS } from "./styles";

export const songOptionsSchema = z.object({
  topic: z.string().trim().max(300).default(""),
  genre: z.string(),
  mood: z.enum(MOODS).or(z.literal("")).default(""),
  language: z.enum([...LANGUAGE_CODES, "hinglish"]).default("hi"),
  durationSec: z.union([z.literal(30), z.literal(60), z.literal(120)]).default(60),
  kidSafe: z.boolean().default(false),
});

// "Write lyrics with AI" needs a topic; "Enhance my lyrics" needs the creator's own lines.
export const lyricsRequestSchema = songOptionsSchema
  .extend({ draft: z.string().trim().max(3000).optional() })
  .refine((r) => r.topic.length >= 3 || (r.draft?.length ?? 0) >= 10, "Write what the song is about, or a few lines of your own");

export const styleRequestSchema = songOptionsSchema.extend({
  idea: z.string().trim().max(300).default(""),
  vocal: z.enum(VOCALS).default("auto"),
});

export const newSongSchema = songOptionsSchema.extend({
  title: z.string().trim().min(1).max(80),
  lyrics: z.string().trim().min(20).max(3000),
  // The creator's own (or AI-enhanced) style text; the genre preset is used when it's empty.
  style: z.string().trim().max(500).optional(),
  vocal: z.enum(VOCALS).default("auto"),
  // Like Suno, one Create makes two versions to choose from, for the price of one song.
  takes: z.union([z.literal(1), z.literal(2)]).default(2),
});

// ACE-Step's vocal language: Hinglish lyrics are mostly Hindi words.
export function vocalLanguage(language: SongLanguage): string {
  return language === "hinglish" ? "hi" : language;
}
