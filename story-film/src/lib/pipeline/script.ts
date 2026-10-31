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
    "Narration per shot must be speakable in about 5 seconds (max ~14 words).",
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

export function parseScript(raw: string): FilmScript {
  return filmScriptSchema.parse(parseJson(raw));
}
