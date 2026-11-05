import { z } from "zod";
import type { LlmProvider } from "@/lib/providers/types";
import { cleanLyrics, type LyricsRequest, lyricsLanguageRule } from "./lyrics";
import { parseSections } from "./structure";

// "✨ Write a rap verse": rap bars in the song's own language (Hinglish works) that fit its topic and lyrics.
export interface RapRequest extends Pick<LyricsRequest, "topic" | "genre" | "mood" | "language" | "kidSafe"> {
  // The song so far, so the bars pick up its story and hook.
  lyrics: string;
  bars: 8 | 12 | 16;
}

export function buildRapPrompt(req: RapRequest): string {
  const sung = parseSections(req.lyrics)
    .filter((s) => s.kind !== "Rap" && s.body)
    .map((s) => s.body)
    .join("\n")
    .slice(0, 1500);
  return [
    "You are a rapper and songwriter. Write one original rap verse for a song.",
    req.topic ? `The song is about: ${req.topic}` : "",
    sung ? `The rest of the song, for its story and words:\n${sung}` : "",
    `Genre: ${req.genre.label}. Mood: ${req.mood || "any"}.`,
    lyricsLanguageRule(req.language),
    req.language === "hinglish" ? "Mix Hindi and English the way Indian hip-hop does; English words can carry the rhymes." : "",
    `Exactly ${req.bars} bars, one bar per line. Each bar is 8-14 syllables, punchy, with end rhymes in pairs and internal rhymes.`,
    "Pick up the song's topic and images, with fresh details; don't repeat the chorus.",
    "Confident flow, wordplay, no filler like \"yo\" or \"uh\". Don't name or imitate real rappers, singers or celebrities, and don't copy existing lyrics.",
    req.kidSafe ? "This is for children: clean, playful, positive words only." : "Keep it clean enough for Instagram: no slurs, no explicit content.",
    'Reply with JSON only: {"bars": string} (bars uses \\n between lines, no section tags).',
  ]
    .filter(Boolean)
    .join("\n");
}

const rapSchema = z.object({ bars: z.string().min(20) });

export async function writeRap(llm: LlmProvider, req: RapRequest): Promise<string> {
  const { bars } = rapSchema.parse(await llm.completeJson(buildRapPrompt(req)));
  // Tags the model added anyway are dropped; the bars go under the song's [Rap] block.
  return cleanLyrics(bars)
    .split("\n")
    .filter((l) => l && !/^\[.*\]$/.test(l))
    .slice(0, req.bars)
    .join("\n");
}
