import { z } from "zod";
import type { LlmProvider } from "@/lib/providers/types";
import { cleanLyrics, type SongLanguage } from "./lyrics";

// "Add a rap": one part of a finished song is repainted as a rap verse with new bars.

// Rap packs words in tighter than singing: about one bar every 2.5 seconds.
export function rapBarCount(partSec: number): number {
  return Math.min(16, Math.max(2, Math.round(partSec / 2.5)));
}

export interface RapRequest {
  lyrics: string;
  genre: string;
  mood: string;
  language: SongLanguage;
  partSec: number;
  idea?: string;
}

export function buildRapPrompt(req: RapRequest): string {
  return [
    "You are a desi hip-hop lyricist. Write an original rap verse that drops into this song:",
    req.lyrics.slice(0, 2000),
    `Song: ${req.genre}, ${req.mood || "any"} mood.`,
    req.idea ? `The creator wants the rap to be about: ${req.idea}` : "Rap about the song's own story and feeling.",
    req.language === "hinglish" || req.language === "hi"
      ? "Write in Hinglish (Hindi and English mixed, Latin script), like modern Indian hip-hop."
      : `Write in the song's language (code ${req.language}), in the same script as its lyrics.`,
    `Exactly ${rapBarCount(req.partSec)} bars, one per line, for about ${Math.round(req.partSec)} seconds. Punchy internal rhymes, end rhymes in pairs, a clear rhythm.`,
    "Keep it clean: no slurs or explicit words. Never mention real rappers, singers or celebrities, and don't copy existing lyrics.",
    'Reply with JSON only: {"bars": string} (bars uses \\n between lines, no section tags).',
  ]
    .filter(Boolean)
    .join("\n");
}

const rapSchema = z.object({ bars: z.string().min(10) });

export async function writeRap(llm: LlmProvider, req: RapRequest): Promise<string> {
  const { bars } = rapSchema.parse(await llm.completeJson(buildRapPrompt(req)));
  return cleanBars(bars);
}

export function cleanBars(bars: string): string {
  return cleanLyrics(bars)
    .split("\n")
    .filter((l) => l && !/^\[.*\]$/.test(l))
    .slice(0, 24)
    .join("\n")
    .slice(0, 1200);
}

// Style tags that turn the repainted part into rap while keeping the song's sound around it.
export function rapStyle(style: string): string {
  return `${style}, [rap verse], hip-hop rap vocals, fast rhythmic flow, punchy delivery`.slice(0, 512);
}

// The song's lyrics with the lines sung in [startSec, endSec] swapped for a [Rap] verse.
// Songs don't keep word timings, so lines are spread evenly over the song (tags take no time).
export function lyricsWithRap(lyrics: string, durationSec: number, startSec: number, endSec: number, bars: string): string {
  const lines = lyrics.split("\n");
  const sung = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.trim() && !/^\[.*\]$/.test(l.trim()));
  const rap = ["[Rap]", ...cleanBars(bars).split("\n")];
  if (!sung.length || durationSec <= 0) return [...lines, "", ...rap].join("\n").trim();
  const at = (sec: number) => Math.min(sung.length - 1, Math.max(0, Math.floor((sec / durationSec) * sung.length)));
  const first = sung[at(startSec)].i;
  const last = sung[Math.max(at(startSec), at(Math.max(startSec, endSec - 0.01)))].i;
  return [...lines.slice(0, first), ...rap, ...lines.slice(last + 1)].join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
