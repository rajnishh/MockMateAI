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

// "Enhance": the creator's own lines grown into a full song. Their lines stay word for word.
export function draftLines(draft: string): string[] {
  return cleanLyrics(draft)
    .split("\n")
    .filter((l) => l && !/^\[.*\]$/.test(l));
}

export function buildEnhancePrompt(draft: string, req: LyricsRequest, retry = false): string {
  return [
    "You are a songwriter. A creator wrote these lines for a song:",
    draft.trim(),
    "Turn them into a complete, original song about the same thing.",
    "Keep every one of the creator's lines exactly as written, in the same script, in their order; they usually open the song as the first verse.",
    retry ? "Your last answer dropped or changed some of the creator's lines. This time every line above must appear unchanged." : "",
    "Stay true to their story and feeling: who it's about, what happens, how it feels. Don't add events they didn't write (no death, breakup or loss unless they wrote it).",
    "Keep the singer the same person throughout: same point of view and gender (in Hindi, verb endings must match, e.g. a \"rani\" sings \"karti hoon\", not \"karta hoon\").",
    "Write a NEW short chorus (2-4 lines) around the song's key phrase, repeated word for word each time. Don't reuse the creator's verse lines as the chorus.",
    "New verses add fresh details and memories in the same language, voice and feeling, so it reads as one song.",
    req.topic ? `Topic: ${req.topic}` : "",
    `Genre: ${req.genre.label}. Mood: ${req.mood || "any"}.`,
    lyricsLanguageRule(draftLanguage(draft, req.language)),
    `About ${Math.max(targetLines(req.durationSec), draftLines(draft).length + 4)} lines in total for a ${req.durationSec}-second song.`,
    "Start with a section tag. Tags on their own lines: [Verse], [Chorus], [Verse], [Chorus], optionally [Bridge] and [Outro].",
    "Short, singable lines with natural rhythm and rhyme.",
    "Never mention or imitate real singers, bands or celebrities, and don't copy existing song lyrics.",
    req.kidSafe ? "This is for young children: simple words, gentle and positive." : "",
    'Reply with JSON only: {"title": string, "lyrics": string} (lyrics uses \\n between lines).',
  ]
    .filter(Boolean)
    .join("\n");
}

// The creator's own lines decide the script: Hindi words typed in Latin letters stay Hinglish,
// and Devanagari lines stay Devanagari even if "Hinglish" was picked.
export function draftLanguage(draft: string, language: SongLanguage): SongLanguage {
  const letters = draft.match(/\p{L}/gu) ?? [];
  const latin = letters.filter((c) => /\p{Script=Latin}/u.test(c)).length / Math.max(1, letters.length);
  if (latin > 0.8 && language !== "en" && language !== "hinglish") return "hinglish";
  if (latin < 0.2 && language === "hinglish") return "hi";
  return language;
}

// Compares lines without spacing or punctuation, so a moved comma still counts as kept.
const bare = (l: string) => l.toLowerCase().replace(/[\s\p{P}]/gu, "");

export function missingLines(draft: string, lyrics: string): string[] {
  const have = new Set(lyrics.split("\n").map(bare));
  return draftLines(draft).filter((l) => !have.has(bare(l)));
}

export async function enhanceLyrics(llm: LlmProvider, draft: string, req: LyricsRequest): Promise<{ title: string; lyrics: string }> {
  let out = { title: "", lyrics: "" };
  for (const retry of [false, true]) {
    const raw = lyricsSchema.parse(await llm.completeJson(buildEnhancePrompt(draft, req, retry)));
    out = { title: raw.title.trim(), lyrics: cleanLyrics(raw.lyrics) };
    if (missingLines(draft, out.lyrics).length === 0) break;
  }
  return out;
}
