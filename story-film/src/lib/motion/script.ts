import { z } from "zod";
import { writeInRule } from "@/lib/languages";
import type { NarrationLanguage } from "@/lib/providers/types";

// A motion reel is a sequence of animated text slides with a voice-over: no image or
// video models, so it costs almost nothing to make.
export const MOTION_THEMES = ["navy", "saffron", "mint", "night"] as const;
export type MotionTheme = (typeof MOTION_THEMES)[number];

// How the reel ends. Most reels need no call to action; the creator decides.
export const ENDINGS = ["none", "follow", "comment", "auto"] as const;
export type Ending = (typeof ENDINGS)[number];

const narration = z.string().min(1).max(220);
const short = (max: number) => z.string().min(1).max(max);
export const slideSchema = z.discriminatedUnion("type", [
  // highlight: a word or phrase from the headline drawn in the accent colour.
  z.object({ type: z.literal("title"), headline: short(80), highlight: z.string().max(40).optional(), sub: z.string().max(90).optional(), narration }),
  z.object({ type: z.literal("list"), heading: short(60), items: z.array(short(60)).min(2).max(5), narration }),
  z.object({ type: z.literal("stat"), value: z.number().finite(), prefix: z.string().max(4).optional(), suffix: z.string().max(6).optional(), label: short(70), narration }),
  z.object({ type: z.literal("quote"), text: short(140), author: z.string().max(40).optional(), narration }),
  // A common belief struck through, then the better idea.
  z.object({ type: z.literal("contrast"), before: short(60), after: short(60), narration }),
  // A line that grows across real values in order (e.g. followers per month).
  z.object({ type: z.literal("chart"), label: short(60), values: z.array(z.number().finite()).min(2).max(8), suffix: z.string().max(6).optional(), narration }),
  z.object({
    type: z.literal("compare"),
    before: z.object({ label: short(24), value: short(16) }),
    after: z.object({ label: short(24), value: short(16) }),
    narration,
  }),
  z.object({ type: z.literal("timer"), seconds: z.number().int().min(3).max(60), label: short(60), narration }),
  z.object({ type: z.literal("question"), text: short(90), narration }),
  z.object({ type: z.literal("cta"), text: short(60), action: z.string().max(30).optional(), narration }),
]);

export const motionScriptSchema = z.object({
  title: z.string().min(1).max(100),
  language: z.string().min(2),
  theme: z.enum(MOTION_THEMES).catch("navy"),
  slides: z.array(slideSchema).min(2).max(12),
});

export type Slide = z.infer<typeof slideSchema>;
export type MotionScript = z.infer<typeof motionScriptSchema>;

export interface MotionOptions {
  story: string;
  durationSec: number;
  language?: NarrationLanguage;
  kidSafe?: boolean;
  ending?: Ending;
  // For "comment" endings: the word viewers comment (the creator's own keyword).
  keyword?: string;
  handle?: string;
}

// Roughly one slide per 6 seconds.
export function slideCountFor(durationSec: number): number {
  return Math.min(10, Math.max(3, Math.round(durationSec / 6)));
}

function endingRule({ ending = "auto", keyword, handle }: MotionOptions): string {
  const who = handle ? ` (${handle})` : "";
  switch (ending) {
    case "none":
      return "Do NOT add a call to action: end on the last useful slide. No cta slide.";
    case "follow":
      return `End with one "cta" slide asking viewers to follow${who} for more, as a natural line in the reel's language.`;
    case "comment":
      return `End with one "cta" slide inviting viewers to comment ${keyword ? `"${keyword}"` : "a short keyword that fits the reel"} to get the resource the reel mentions; put "Comment ${keyword ?? "<KEYWORD>"}" in action.`;
    default:
      return 'Add a final "cta" slide only if the idea clearly offers something more (a part 2, a resource, a series); otherwise end without one. Never force it.';
  }
}

export function buildMotionPrompt(opts: MotionOptions): string {
  const { story, durationSec, language = "auto", kidSafe } = opts;
  const lang =
    language === "auto"
      ? "Detect the idea's language and write all on-screen text and narration in it, in its native script; set `language` to its ISO 639-1 code."
      : `${writeInRule(language)} Use it for all on-screen text and narration. Set \`language\` to "${language}".`;
  return [
    "You write short vertical (9:16) motion-graphics reels: bold animated text slides with a voice-over.",
    `Write about ${slideCountFor(durationSec)} slides (±1) for a reel of about ${durationSec} seconds.`,
    lang,
    "Start with a \"title\" slide: a punchy hook; set highlight to the 1-3 most important words of the headline, copied exactly.",
    "Then choose the slide types that suit the idea. Don't use every type; variety helps but clarity matters more:",
    '- "list": a heading and 2-5 short items (tips, steps, reasons).',
    '- "stat": one striking number (plain number value; optional prefix like "₹" and suffix like "%" or "x") with a label.',
    '- "chart": 2-8 values in order that show a trend, with a label and optional suffix.',
    '- "compare": before vs after (or old vs new way), each a short label and a short value like "2 hrs" or "15 min".',
    '- "contrast": a common belief or mistake (before) and the better idea (after).',
    '- "timer": a countdown of 3-60 seconds for a challenge or quick task, with a label.',
    '- "question": a short question to make viewers think.',
    '- "quote": a short real quote with its real author, or the creator\'s own line without author.',
    "Numbers in stat, chart and compare must be real and well known, or given in the idea. Never invent statistics, results or quotes.",
    endingRule(opts),
    "Keep on-screen text short and scannable; the narration says it naturally in at most ~25 words per slide.",
    'Pick a theme that fits the mood: "navy" (trust, tech, money), "saffron" (warm, festive, food), "mint" (fresh, health, learning), "night" (bold, dramatic).',
    ...(kidSafe ? ["The audience is young children: gentle, positive, simple words, nothing scary or unsafe."] : []),
    "Reply with JSON only: {\"title\":string,\"language\":string,\"theme\":string,\"slides\":[...]} where each slide has \"type\", its fields above (title: headline, highlight, sub; list: heading, items; stat: value, prefix, suffix, label; chart: label, values, suffix; compare: before{label,value}, after{label,value}; contrast: before, after; timer: seconds, label; question: text; quote: text, author; cta: text, action) and \"narration\".",
    "",
    "Idea:",
    story,
  ].join("\n");
}

// The creator's choice wins over the model: "none" removes any call to action the model added.
export function applyEnding(script: MotionScript, ending: Ending = "auto"): MotionScript {
  if (ending !== "none") return script;
  const slides = script.slides.filter((s) => s.type !== "cta");
  return { ...script, slides: slides.length >= 2 ? slides : script.slides };
}

// How long each slide stays on screen: its narration plus a beat, and enough time for its animation.
export function slideDurations(script: MotionScript, narrationSec: number[]): number[] {
  return script.slides.map((s, i) => {
    const minForContent =
      s.type === "list" ? 1.2 + s.items.length * 0.7 : s.type === "chart" || s.type === "stat" || s.type === "timer" ? 3.5 : 2.5;
    const d = Math.max((narrationSec[i] ?? 0) + 0.7, minForContent, 3);
    return Math.round(Math.min(d, 12) * 30) / 30;
  });
}
