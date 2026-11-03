import { z } from "zod";
import { findLanguage, writeInRule } from "@/lib/languages";
import type { CharacterProfile, LlmProvider } from "@/lib/providers/types";

export const IDEA_FORMATS = ["story", "motion", "dance"] as const;
export type IdeaFormat = (typeof IDEA_FORMATS)[number];

const ideaSchema = z.object({
  title: z.string().trim().min(1),
  // The first spoken line: what stops the scroll. Older replies and clients may not have it.
  hook: z.string().trim().optional().catch(undefined),
  idea: z.string().trim().min(1),
  format: z.enum(IDEA_FORMATS).optional().catch(undefined),
});

export const ideasSchema = z.object({ ideas: z.array(ideaSchema).min(1).max(8) });

export type Idea = z.infer<typeof ideaSchema>;

export interface SuggestionRequest {
  niche?: string;
  language?: string;
  character?: Pick<CharacterProfile, "name" | "description">;
  // Earlier episodes of this character's series, newest first, so the next one moves the story on.
  episodes?: string[];
  kidSafe?: boolean;
  // When set, every idea uses this format; otherwise the model picks the best fit for each.
  format?: IdeaFormat;
  count?: number;
  // Titles already shown, so "Suggest again" gives new ones.
  avoid?: string[];
  now?: Date;
}

// Different shapes of reel, so six ideas never read like one idea six times.
const ANGLES = [
  "a personal story or POV with a twist at the end",
  "a myth vs fact or a common mistake people make",
  "a numbered list (3 or 5 things) with one surprising item",
  "a before-and-after or a small transformation",
  "a relatable everyday moment from family, office, school or the market",
  "a timely angle for this month (season, festival, exams, weddings, travel), at most one idea, only if it fits the topic",
  "a surprising fact, number or price that most people get wrong",
  "a challenge or a quick test the viewer can try",
];

const FORMAT_RULES = [
  '"story": narrated scenes with pictures. Best for stories, POV, history, folk tales and moments.',
  '"motion": animated text and graphics with a voice-over. Best for tips, lists, numbers, myth vs fact.',
  '"dance": cartoon kids dance to a dhol beat and chant a rhyme. Only for young children (counting, words, habits).',
];

function languageRule(language?: string): string {
  // The app sends a language code ("hi"); older web clients send a name ("Hindi").
  if (findLanguage(language ?? "")) return writeInRule(language!);
  return `Write in ${language ?? "English"}, in its native script.`;
}

// Arabic speakers are mostly in the Gulf; everyone else gets Indian references unless the topic says otherwise.
function audienceRule(language?: string): string {
  const code = findLanguage(language ?? "")?.code ?? (language?.toLowerCase().startsWith("arab") ? "ar" : undefined);
  if (code === "ar") return "Audience: viewers in the UAE, Saudi Arabia and the Gulf. Use Gulf places, food, prices in AED or SAR, and everyday Gulf life.";
  return "Audience: Indian viewers (and Indians in the Gulf). Use Indian places, food, festivals, prices in ₹, and everyday desi life.";
}

export function buildIdeasPrompt(req: SuggestionRequest): string {
  const count = Math.min(Math.max(req.count ?? 6, 1), 8);
  const month = (req.now ?? new Date()).toLocaleString("en", { month: "long" });
  const nextEpisode = Boolean(req.character && req.episodes?.length);
  return [
    `You are a top short-video strategist. Suggest ${count} ${nextEpisode ? "next episodes" : "reel ideas"} for vertical videos (Reels / Shorts, 15-60 seconds) a creator can make today.`,
    req.niche ? `Creator's topic: ${req.niche}. Stay inside this topic.` : "No topic given: pick specific, popular topics (food, money, family, school, cricket, travel, tech, health).",
    audienceRule(req.language),
    req.character ? `Every idea stars the recurring character ${req.character.name} (${req.character.description}).` : "",
    nextEpisode
      ? `This is a series. Earlier episodes, newest first:\n${req.episodes!.map((e) => `- ${e}`).join("\n")}\nEach idea is a fresh next episode: a new situation that builds on the series, never a repeat.`
      : "",
    req.kidSafe ? "Audience is young children: gentle, educational, age-appropriate only." : "",
    `This month is ${month}.`,
    count > 1 ? `Give each idea a different angle, choosing from:\n${ANGLES.map((a) => `- ${a}`).join("\n")}` : "",
    "Be concrete: name the exact dish, spice, place, amount, rule or situation (the actual name, not \"a traditional dish\" or \"a spice\"). Never a generic idea like \"tips about X\" or \"the importance of Y\".",
    "hook: the first sentence spoken in the video, 6-12 words, different from the title. It must stop the scroll with curiosity, a bold claim, a number or a question. Never start with \"Hi\", \"Welcome\" or \"In this video\".",
    'Hook style only, never copy these or their topics: "I saved ₹4,000 this month with one boring rule." / "Every auto driver knows this. You don\'t." / "Your phone charger is lying to you about one thing." Bad hooks: "Did you know?", "How?", a hook that is just the title.',
    "title: catchy, at most 6 words.",
    "idea: at most 50 words on what happens, beat by beat, ending with a payoff or twist, so the video can be generated from it. Describe the scenes directly; never write \"in this video we will show\".",
    req.format ? `format: always "${req.format}".` : `format: the best fit for the idea, one of:\n${FORMAT_RULES.map((r) => `- ${r}`).join("\n")}`,
    req.avoid?.length ? `Don't repeat these ideas: ${req.avoid.map((t) => `"${t}"`).join(", ")}.` : "",
    languageRule(req.language) + " Write title, hook and idea in that language.",
    'Reply with JSON only: {"ideas":[{"title":string,"hook":string,"idea":string,"format":"story"|"motion"|"dance"}]}',
  ]
    .filter(Boolean)
    .join("\n");
}

export async function suggestIdeas(llm: LlmProvider, req: SuggestionRequest): Promise<Idea[]> {
  const ideas = ideasSchema.parse(await llm.completeJson(buildIdeasPrompt(req))).ideas;
  return ideas.map((i) => ({ ...i, hook: strongHook(i), format: req.format ?? i.format ?? "story" }));
}

// The free model sometimes sends "Did you know?" or the title again; showing nothing beats a weak hook.
function strongHook(i: Idea): string | undefined {
  const hook = i.hook?.trim();
  if (!hook || hook === i.title || hook.split(/\s+/).length < 4) return undefined;
  return hook;
}

// The text a reel is made from: the hook goes first so the script opens with it.
export function ideaBrief(i: Pick<Idea, "title" | "hook" | "idea">): string {
  return i.hook ? `${i.hook} ${i.idea}` : `${i.title}. ${i.idea}`;
}
