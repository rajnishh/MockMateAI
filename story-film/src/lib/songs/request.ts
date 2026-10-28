import { z } from "zod";
import { MOODS } from "./styles";

export const songOptionsSchema = z.object({
  topic: z.string().trim().min(3).max(300),
  genre: z.string(),
  mood: z.enum(MOODS).or(z.literal("")).default(""),
  language: z.enum(["hi", "en", "hinglish"]).default("hi"),
  durationSec: z.union([z.literal(30), z.literal(60), z.literal(120)]).default(60),
  kidSafe: z.boolean().default(false),
});

export const newSongSchema = songOptionsSchema.extend({
  title: z.string().trim().min(1).max(80),
  lyrics: z.string().trim().min(20).max(3000),
});

// ACE-Step's vocal language: Hinglish lyrics are mostly Hindi words.
export function vocalLanguage(language: "hi" | "en" | "hinglish"): string {
  return language === "en" ? "en" : "hi";
}
