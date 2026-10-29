import { z } from "zod";
import { writeInRule } from "@/lib/languages";
import type { NarrationLanguage } from "@/lib/providers/types";

// A motion reel is a sequence of animated text slides with a voice-over: no image or
// video models, so it costs almost nothing to make.
export const MOTION_THEMES = ["navy", "saffron", "mint", "night"] as const;
export type MotionTheme = (typeof MOTION_THEMES)[number];

const narration = z.string().min(1).max(220);
export const slideSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("title"), headline: z.string().min(1).max(80), sub: z.string().max(90).optional(), narration }),
  z.object({ type: z.literal("list"), heading: z.string().min(1).max(60), items: z.array(z.string().min(1).max(60)).min(2).max(5), narration }),
  z.object({
    type: z.literal("stat"),
    value: z.number().finite(),
    prefix: z.string().max(4).optional(),
    suffix: z.string().max(6).optional(),
    label: z.string().min(1).max(70),
    narration,
  }),
  z.object({ type: z.literal("quote"), text: z.string().min(1).max(140), author: z.string().max(40).optional(), narration }),
  z.object({ type: z.literal("cta"), text: z.string().min(1).max(60), action: z.string().max(30).optional(), narration }),
]);

export const motionScriptSchema = z.object({
  title: z.string().min(1).max(100),
  language: z.string().min(2),
  theme: z.enum(MOTION_THEMES).catch("navy"),
  slides: z.array(slideSchema).min(2).max(12),
});

export type Slide = z.infer<typeof slideSchema>;
export type MotionScript = z.infer<typeof motionScriptSchema>;

// Roughly one slide per 6 seconds, always opening with a title and closing with a call to action.
export function slideCountFor(durationSec: number): number {
  return Math.min(10, Math.max(3, Math.round(durationSec / 6)));
}

export function buildMotionPrompt({ story, durationSec, language = "auto", kidSafe }: { story: string; durationSec: number; language?: NarrationLanguage; kidSafe?: boolean }): string {
  const lang =
    language === "auto"
      ? "Detect the idea's language and write all on-screen text and narration in it, in its native script; set `language` to its ISO 639-1 code."
      : `${writeInRule(language)} Use it for all on-screen text and narration. Set \`language\` to "${language}".`;
  return [
    "You write short vertical (9:16) motion-graphics reels: bold animated text slides with a voice-over.",
    `Write exactly ${slideCountFor(durationSec)} slides for a reel of about ${durationSec} seconds.`,
    lang,
    "Slide types:",
    '- "title": a punchy hook (headline, optional sub). Always the first slide.',
    '- "list": a heading and 2-5 short items (tips, steps, reasons).',
    '- "stat": one striking number (value as a plain number; optional prefix like "₹" and suffix like "%" or "x") with a label. Only use real, well-known figures or ones given in the idea; never invent statistics.',
    '- "quote": a short quote with optional author (only real quotes with the right author, or the creator\'s own line without author).',
    '- "cta": the closing call to action (text, optional action like "Comment GUIDE" or "Follow for more"). Always the last slide.',
    "Keep on-screen text short and scannable; the narration says it naturally in at most ~25 words per slide.",
    'Pick a theme that fits the mood: "navy" (trust, tech, money), "saffron" (warm, festive, food), "mint" (fresh, health, learning), "night" (bold, dramatic).',
    ...(kidSafe ? ["The audience is young children: gentle, positive, simple words, nothing scary or unsafe."] : []),
    "Reply with JSON only, matching:",
    '{"title":string,"language":string,"theme":string,"slides":[{"type":"title","headline":string,"sub":string,"narration":string} | {"type":"list","heading":string,"items":[string],"narration":string} | {"type":"stat","value":number,"prefix":string,"suffix":string,"label":string,"narration":string} | {"type":"quote","text":string,"author":string,"narration":string} | {"type":"cta","text":string,"action":string,"narration":string}]}',
    "",
    "Idea:",
    story,
  ].join("\n");
}

// How long each slide stays on screen: its narration plus a beat, and enough time for list items to appear.
export function slideDurations(script: MotionScript, narrationSec: number[]): number[] {
  return script.slides.map((s, i) => {
    const minForContent = s.type === "list" ? 1.2 + s.items.length * 0.7 : s.type === "stat" ? 3 : 2.5;
    const d = Math.max((narrationSec[i] ?? 0) + 0.7, minForContent, 3);
    return Math.round(Math.min(d, 12) * 30) / 30;
  });
}
