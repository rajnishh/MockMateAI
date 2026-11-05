import { pathToFileURL } from "node:url";
import { z } from "zod";
import { LANGUAGE_CODES } from "@/lib/languages";
import type { RemixCall } from "@/lib/songs/remix";
import { type Genre, MOODS, stylePrompt, VOCALS } from "@/lib/songs/styles";

// A song on the creator's own tune: their hummed or sung recording goes to ACE-Step's audio-to-audio
// ("remix" mode) with the new style, which keeps the tune and timing and adds the band and a singer.
// fal: $0.0002 per second of audio (pricing API, 2026-11-05), so a 60 s take costs ~1 cent.
export const TUNE_ORIGINAL_STYLE = {
  hum: "a cappella humming, solo human voice, no instruments, home phone recording",
  sing: "a cappella singing, solo human voice, no instruments, home phone recording",
} as const;
export const INSTRUMENTAL = "[instrumental]";

export const tuneSongSchema = z.object({
  // The creator can say it was a hum or a song even if Reelkar guessed the other.
  kind: z.enum(["hum", "sing"]),
  title: z.string().trim().min(1).max(80),
  genre: z.string(),
  mood: z.enum(MOODS).or(z.literal("")).default(""),
  vocal: z.enum(VOCALS).default("auto"),
  style: z.string().trim().max(500).optional(),
  language: z.enum([...LANGUAGE_CODES, "hinglish"]).default("hi"),
  // What a hummed song is about: Reelkar writes lyrics for it. Empty keeps it instrumental.
  topic: z.string().trim().max(300).default(""),
  // The sung lines (sing) or the creator's own lyrics; they win over the topic.
  lyrics: z.string().trim().max(3000).default(""),
});
export type TuneSongRequest = z.infer<typeof tuneSongSchema>;

export function tuneSongCall(input: {
  takeMp3: string;
  kind: "hum" | "sing";
  genre: Genre;
  mood: string;
  vocal: (typeof VOCALS)[number];
  style?: string;
  // The lines heard in the take (sing), and the lines to sing in the song.
  heardLyrics: string;
  lyrics: string;
}): RemixCall {
  return {
    kind: "cover",
    input: {
      audioUrl: pathToFileURL(input.takeMp3).href,
      style: stylePrompt(input.genre, input.mood, input.vocal, input.style),
      originalStyle: TUNE_ORIGINAL_STYLE[input.kind],
      lyrics: input.lyrics || INSTRUMENTAL,
      originalLyrics: (input.kind === "sing" && input.heardLyrics) || INSTRUMENTAL,
    },
  };
}
