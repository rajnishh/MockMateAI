import { z } from "zod";
import { findLanguage, writeInRule } from "@/lib/languages";
import type { CharacterProfile, LlmProvider } from "@/lib/providers/types";

export const ideasSchema = z.object({
  ideas: z.array(z.object({ title: z.string().min(1), idea: z.string().min(1) })).min(1).max(8),
});

export type Idea = z.infer<typeof ideasSchema>["ideas"][number];

export interface SuggestionRequest {
  niche?: string;
  language?: string;
  character?: Pick<CharacterProfile, "name" | "description">;
  kidSafe?: boolean;
}

export function buildIdeasPrompt(req: SuggestionRequest): string {
  return [
    "Suggest 6 ideas for short vertical videos (Reels / Shorts, 15-60 seconds) a creator could make today.",
    req.niche ? `Creator's niche: ${req.niche}.` : "Pick popular, broadly appealing topics.",
    req.character ? `Every idea stars the recurring character ${req.character.name} (${req.character.description}).` : "",
    req.kidSafe ? "Audience is young children: gentle, educational, age-appropriate only." : "",
    // The app sends a language code ("hi"); older web clients send a name ("Hindi").
    findLanguage(req.language ?? "") ? writeInRule(req.language!) : `Write in ${req.language ?? "English"}, in its native script.`,
    "Each idea: a catchy title (max 6 words) and a 1-2 sentence idea the video can be generated from.",
    'Reply with JSON only: {"ideas":[{"title":string,"idea":string}]}',
  ]
    .filter(Boolean)
    .join("\n");
}

export async function suggestIdeas(llm: LlmProvider, req: SuggestionRequest): Promise<Idea[]> {
  return ideasSchema.parse(await llm.completeJson(buildIdeasPrompt(req))).ideas;
}
