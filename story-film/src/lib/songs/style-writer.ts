import { z } from "zod";
import type { LlmProvider } from "@/lib/providers/types";
import type { SongLanguage } from "./lyrics";
import type { Genre, Vocal } from "./styles";

// "Enhance style": a creator's few words ("sad papa beti song") written out as the detailed
// style description a music model needs: genre, instruments, tempo, vocals, mood and production.
export interface StyleRequest {
  idea: string;
  genre: Genre;
  mood: string;
  vocal: Vocal;
  language: SongLanguage;
}

export function buildStylePrompt(req: StyleRequest): string {
  return [
    "You write style descriptions for an AI music model. Describe how a song should sound.",
    `The creator's idea: ${req.idea || "(none)"}`,
    `Starting point: ${req.genre.label} (${req.genre.prompt}), ${req.mood || "any"} mood.`,
    "The creator's idea comes first: where it asks for a different feeling, genre or sound than the starting point, follow the idea.",
    req.vocal !== "auto" ? `Vocals: ${req.vocal === "duet" ? "male and female duet" : `${req.vocal} lead`}.` : "",
    `The lyrics are in ${req.language === "hinglish" ? "Hinglish" : `language code ${req.language}`}; pick instruments and genre that suit it.`,
    "Write comma-separated English tags, most important first: genre and sub-genre, 3-5 instruments, tempo with a bpm number, vocal type and delivery, mood, and production feel.",
    "Under 300 characters. Sound only: never name real singers, bands, composers, films or songs.",
    'Reply with JSON only: {"style": string}',
  ]
    .filter(Boolean)
    .join("\n");
}

const styleSchema = z.object({ style: z.string().min(5) });

export async function writeStyle(llm: LlmProvider, req: StyleRequest): Promise<string> {
  const { style } = styleSchema.parse(await llm.completeJson(buildStylePrompt(req)));
  return style.replace(/\s+/g, " ").replace(/^[\s,]+|[\s,.]+$/g, "").slice(0, 300);
}
