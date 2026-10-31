import { z } from "zod";
import { type LanguageCode, writeInRule } from "@/lib/languages";
import type { LlmProvider } from "@/lib/providers/types";
import type { Genre } from "./styles";

// Hinglish is a song-only option (Hindi and English mixed, Latin script).
export type SongLanguage = LanguageCode | "hinglish";

export interface LyricsRequest {
  topic: string;
  genre: Genre;
  mood: string;
  language: SongLanguage;
  durationSec: number;
  kidSafe?: boolean;
}

function lyricsLanguageRule(language: SongLanguage): string {
  return language === "hinglish"
    ? "Write the lyrics in Hinglish (Hindi and English mixed, Latin script), as in modern Indian pop."
    : `Lyrics: ${writeInRule(language)}`;
}

// Roughly 2.5 sung lines per 10 seconds keeps lyrics from being rushed or cut off.
export function targetLines(durationSec: number): number {
  return Math.max(8, Math.round(durationSec / 4));
}

export function buildLyricsPrompt(req: LyricsRequest): string {
  return [
    "You are a songwriter. Write original song lyrics.",
    `Topic: ${req.topic}`,
    `Genre: ${req.genre.label}. Mood: ${req.mood || "any"}.`,
    lyricsLanguageRule(req.language),
    `About ${targetLines(req.durationSec)} lines in total for a ${req.durationSec}-second song.`,
    "Structure with section tags on their own lines: [Verse], [Chorus], optionally [Bridge] and [Outro]. Repeat the chorus.",
    "Short, singable lines with natural rhythm and some rhyme. A memorable chorus hook.",
    "Never mention or imitate real singers, bands or celebrities, and don't copy existing song lyrics.",
    req.kidSafe ? "This is for young children: simple words, gentle and positive, educational if possible." : "",
    'Reply with JSON only: {"title": string, "lyrics": string} (lyrics uses \\n between lines).',
  ]
    .filter(Boolean)
    .join("\n");
}

const lyricsSchema = z.object({ title: z.string().min(1).max(80), lyrics: z.string().min(20) });

export function cleanLyrics(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    // Normalise section tags like "(Chorus)" or "CHORUS:" to "[Chorus]".
    .map((l) => l.replace(/^[([]?\s*(verse|chorus|bridge|outro|intro|pre-chorus)(\s*\d+)?\s*[)\]:]?$/i, (_, s: string) => `[${s[0].toUpperCase()}${s.slice(1).toLowerCase()}]`))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 3000);
}

export async function writeLyrics(llm: LlmProvider, req: LyricsRequest): Promise<{ title: string; lyrics: string }> {
  const out = lyricsSchema.parse(await llm.completeJson(buildLyricsPrompt(req)));
  return { title: out.title.trim(), lyrics: cleanLyrics(out.lyrics) };
}
