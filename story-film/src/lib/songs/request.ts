import { z } from "zod";
import { LANGUAGE_CODES } from "@/lib/languages";
import { BPM_MAX, BPM_MIN, EXPERIMENT_DEFAULT, KEY_SCALES, STYLE_STRICTNESS_DEFAULT } from "./controls";
import type { SongLanguage } from "./lyrics";
import { SECTION_KINDS } from "./structure";
import { MOODS, VOCALS } from "./styles";

// "ace-step": full songs of any length (the default); "lyria": Google Lyria 3, always 30 seconds.
export const SONG_MODELS = ["ace-step", "lyria"] as const;
export type SongModel = (typeof SONG_MODELS)[number];
export const SHORT_SONG_SEC = 30;

// Simple: one sentence, AI writes the title, lyrics and style. Custom: the creator's own words and dials.
// Instrumental: no vocals, just the sound.
export const SONG_MODES = ["simple", "custom", "instrumental"] as const;
export type SongMode = (typeof SONG_MODES)[number];

export const songOptionsSchema = z.object({
  topic: z.string().trim().max(300).default(""),
  genre: z.string(),
  mood: z.enum(MOODS).or(z.literal("")).default(""),
  language: z.enum([...LANGUAGE_CODES, "hinglish"]).default("hi"),
  durationSec: z.union([z.literal(30), z.literal(60), z.literal(120), z.literal(180), z.literal(240)]).default(60),
  kidSafe: z.boolean().default(false),
});

// "Write lyrics with AI" needs a topic; "Enhance my lyrics" needs the creator's own lines.
const structureSchema = z.array(z.enum(SECTION_KINDS)).max(16).optional();

export const lyricsRequestSchema = songOptionsSchema
  .extend({ draft: z.string().trim().max(3000).optional(), structure: structureSchema, duet: z.boolean().default(false) })
  .refine((r) => r.topic.length >= 3 || (r.draft?.length ?? 0) >= 10, "Write what the song is about, or a few lines of your own");

export const styleRequestSchema = songOptionsSchema.extend({
  idea: z.string().trim().max(300).default(""),
  vocal: z.enum(VOCALS).default("auto"),
});

export const rapRequestSchema = songOptionsSchema.extend({
  lyrics: z.string().max(3000).default(""),
  bars: z.union([z.literal(8), z.literal(12), z.literal(16)]).default(8),
});

export const newSongSchema = songOptionsSchema
  .extend({
    mode: z.enum(SONG_MODES).default("custom"),
    // Simple mode leaves these to AI; Instrumental has no lyrics.
    title: z.string().trim().max(80).default(""),
    lyrics: z.string().trim().max(3000).default(""),
    // The creator's own (or AI-enhanced) style text; the genre preset is used when it's empty.
    style: z.string().trim().max(500).optional(),
    vocal: z.enum(VOCALS).default("auto"),
    // Like Suno, one Create makes two versions to choose from, for the price of one song.
    takes: z.union([z.literal(1), z.literal(2)]).default(2),
    model: z.enum(SONG_MODELS).default("ace-step"),
    // Simple mode: the blocks AI writes the lyrics in.
    structure: structureSchema,
    // Sliders, 0-100 (see controls.ts), and the musical dials. ACE-Step only; Lyria gets BPM and key as words.
    experiment: z.number().int().min(0).max(100).default(EXPERIMENT_DEFAULT),
    strictness: z.number().int().min(0).max(100).default(STYLE_STRICTNESS_DEFAULT),
    bpm: z.number().int().min(BPM_MIN).max(BPM_MAX).optional(),
    keyScale: z.enum(KEY_SCALES as [string, ...string[]]).optional(),
  })
  .superRefine((r, ctx) => {
    if (r.mode === "custom" && !r.title) ctx.addIssue({ code: "custom", path: ["title"], message: "Give the song a title" });
    if (r.mode === "custom" && r.lyrics.length < 20) ctx.addIssue({ code: "custom", path: ["lyrics"], message: "Write the lyrics, or a few lines and tap Enhance" });
    if (r.mode !== "custom" && r.topic.length < 3 && !r.title) ctx.addIssue({ code: "custom", path: ["topic"], message: "Say in a sentence what the song is about" });
  });

export type NewSongRequest = z.infer<typeof newSongSchema>;

export function songLength(model: SongModel, durationSec: number): number {
  return model === "lyria" ? SHORT_SONG_SEC : durationSec;
}

// ACE-Step's vocal language: Hinglish lyrics are mostly Hindi words.
export function vocalLanguage(language: SongLanguage): string {
  return language === "hinglish" ? "hi" : language;
}
