import { z } from "zod";
import { writeInRule } from "@/lib/languages";
import type { FilmScript, NarrationLanguage, ScriptRequest } from "@/lib/providers/types";
import { STYLE_HINTS } from "@/lib/styles";

export const filmScriptSchema = z.object({
  title: z.string().min(1),
  language: z.string().min(2),
  characters: z.array(z.object({ name: z.string(), description: z.string() })).max(5),
  shots: z
    .array(
      z.object({
        narration: z.string(),
        imagePrompt: z.string().min(1),
        motionPrompt: z.string().min(1),
      }),
    )
    .min(1),
  musicPrompt: z.string().min(1),
});

export { STYLE_HINTS } from "@/lib/styles";

const KID_SAFE_RULES = [
  "The audience is young children. Keep everything gentle, positive and age-appropriate:",
  "no violence, fear, romance, brands, real people or unsafe behaviour; simple words and short sentences.",
  // Image safety filters misread these in children's scenes and refuse the picture.
  "In imagePrompt, show every child fully clothed in everyday outfits and avoid the words baby, toddler, bath, bathtub,",
  "bed, bedroom, naked, bare, kiss and swimsuit; say \"little child\", \"splash time\" or \"cozy room\" instead.",
];

function languageRule(language: NarrationLanguage): string {
  if (language === "auto") {
    return "Detect the idea's language and write all narration in that language, in its native script; use its ISO 639-1 code for `language`.";
  }
  return `Narration: ${writeInRule(language)} Set \`language\` to "${language}".`;
}

export function buildScriptPrompt({ story, style, shotCount, character, kidSafe, language = "auto" }: ScriptRequest): string {
  return [
    "You are a screenwriter turning a user's idea into a short vertical (9:16) video.",
    `Write exactly ${shotCount} shots of 5 seconds each.`,
    languageRule(language),
    "title follows the narration language; imagePrompt, motionPrompt and musicPrompt are always in English.",
    "Narration per shot must be speakable in about 5 seconds (max ~14 words); every shot has narration.",
    "title is a short, catchy name of 2 to 6 words and is never empty.",
    ...(character
      ? [
          `The main character is ${character.name}: ${character.description}.`,
          `Include "${character.name}, ${character.description}" verbatim in every imagePrompt where they appear.`,
        ]
      : [
          "List up to 5 recurring characters with a fixed visual description, and repeat that description",
          "verbatim inside every imagePrompt where the character appears so identity stays consistent.",
        ]),
    ...(kidSafe ? KID_SAFE_RULES : []),
    `Every imagePrompt must end with the style: "${STYLE_HINTS[style]}".`,
    "motionPrompt describes camera and subject motion only.",
    "musicPrompt describes one instrumental background track (genre, mood, tempo).",
    "Reply with JSON only, matching:",
    '{"title":string,"language":string,"characters":[{"name":string,"description":string}],',
    '"shots":[{"narration":string,"imagePrompt":string,"motionPrompt":string}],"musicPrompt":string}',
    "",
    "Idea:",
    story,
  ].join("\n");
}

// LLMs wrap JSON in prose or code fences often enough that this is worth handling.
export function parseJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  let body = (fenced ? fenced[1] : raw).trim();
  if (!fenced) {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start !== -1 && end > start) body = body.slice(start, end + 1);
  }
  return JSON.parse(body);
}

// A reply that has the right shape but can't make a reel; asking again usually fixes it.
export class GarbledScriptError extends Error {
  constructor(detail: string) {
    super(`The script came back garbled: ${detail}`);
    this.name = "GarbledScriptError";
  }
}

// The free Llama often leaves the title empty; a reel shouldn't fail over that,
// so it falls back to the first narration line or the start of the idea.
function withTitle(data: unknown, story: string): unknown {
  if (!data || typeof data !== "object") return data;
  const d = data as { title?: unknown; shots?: { narration?: unknown }[] };
  if (typeof d.title === "string" && d.title.trim()) return data;
  const narration = (Array.isArray(d.shots) ? d.shots : []).map((s) => s?.narration).find((n) => typeof n === "string" && n.trim());
  const title = (narration as string | undefined)?.trim() || story.trim().split(/\s+/).slice(0, 6).join(" ") || "My reel";
  return { ...d, title: title.slice(0, 60) };
}

export function parseScript(raw: string, story = ""): FilmScript {
  const script = filmScriptSchema.parse(withTitle(parseJson(raw), story));
  if (!script.shots.some((s) => s.narration.trim())) throw new GarbledScriptError("no shot has narration");
  return script;
}

// Worth asking the LLM again: unparseable JSON, the wrong shape, or no narration.
export function isGarbledScript(err: unknown): boolean {
  return err instanceof SyntaxError || err instanceof GarbledScriptError || (err as Error)?.name === "ZodError";
}
