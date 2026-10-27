import { z } from "zod";
import type { FilmScript, FilmStyle } from "@/lib/providers/types";

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

const STYLE_HINTS: Record<FilmStyle, string> = {
  cinematic: "cinematic film still, anamorphic lens, dramatic lighting, shallow depth of field",
  animated: "high-quality 3D animated film style, soft lighting, expressive characters",
  photoreal: "photorealistic, natural light, documentary look",
};

export function buildScriptPrompt(story: string, style: FilmStyle, shotCount: number): string {
  return [
    "You are a screenwriter turning a user's story into a short vertical (9:16) film.",
    `Write exactly ${shotCount} shots of 5 seconds each.`,
    "Detect the story's language and write all narration in that language; use its ISO 639-1 code for `language`.",
    "Narration per shot must be speakable in about 5 seconds (max ~14 words).",
    "List up to 5 recurring characters with a fixed visual description, and repeat that description",
    "verbatim inside every imagePrompt where the character appears so identity stays consistent.",
    `Every imagePrompt must end with the style: "${STYLE_HINTS[style]}".`,
    "motionPrompt describes camera and subject motion only.",
    "musicPrompt describes one instrumental background track (genre, mood, tempo).",
    "Reply with JSON only, matching:",
    '{"title":string,"language":string,"characters":[{"name":string,"description":string}],',
    '"shots":[{"narration":string,"imagePrompt":string,"motionPrompt":string}],"musicPrompt":string}',
    "",
    "Story:",
    story,
  ].join("\n");
}

export function parseScript(raw: string): FilmScript {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : raw).trim();
  return filmScriptSchema.parse(JSON.parse(body));
}
