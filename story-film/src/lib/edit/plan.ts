import { z } from "zod";
import type { Ending } from "@/lib/motion/script";
import type { TimedWord } from "@/lib/providers/whisper";

// What the AI decides for a creator's own video: when to punch in, which short cards to
// show over the video, and (optionally) how it ends. Captions come straight from the transcript.
const span = { start: z.number().min(0), end: z.number().min(0) };

export const cardSchema = z.discriminatedUnion("type", [
  // A key point said in the video, shown as a short headline (highlight = words in the brand colour).
  z.object({ type: z.literal("point"), text: z.string().min(1).max(60), highlight: z.string().max(30).optional(), ...span }),
  z.object({ type: z.literal("list"), heading: z.string().min(1).max(40), items: z.array(z.string().min(1).max(40)).min(2).max(4), ...span }),
  z.object({ type: z.literal("stat"), value: z.number().finite(), prefix: z.string().max(4).optional(), suffix: z.string().max(6).optional(), label: z.string().min(1).max(50), ...span }),
  z.object({ type: z.literal("cta"), text: z.string().min(1).max(50), action: z.string().max(30).optional(), ...span }),
]);

export const editPlanSchema = z.object({
  title: z.string().min(1).max(100),
  zooms: z.array(z.object(span)).max(20).default([]),
  cards: z.array(cardSchema).max(6).default([]),
});

export type Card = z.infer<typeof cardSchema>;
export type EditPlan = z.infer<typeof editPlanSchema>;

export interface PlanOptions {
  words: TimedWord[];
  durationSec: number;
  language?: string;
  ending?: Ending;
  keyword?: string;
  handle?: string;
  zooms?: boolean;
}

// Compact transcript for the prompt: "[12.4] word" every few words keeps it short but timed.
export function timedTranscript(words: TimedWord[]): string {
  return words.map((w, i) => (i % 4 === 0 ? `[${w.start.toFixed(1)}] ${w.word}` : w.word)).join(" ");
}

export function buildEditPrompt(o: PlanOptions): string {
  const ending =
    o.ending === "none"
      ? "Do not add a cta card."
      : o.ending === "follow"
        ? `Add one "cta" card in the last 3 seconds asking viewers to follow${o.handle ? ` ${o.handle}` : ""}.`
        : o.ending === "comment"
          ? `Add one "cta" card in the last 3 seconds with action "Comment ${o.keyword ?? "<a keyword that fits>"}" to get what the creator offers.`
          : 'Add a "cta" card only if the creator asks viewers to do something (follow, comment, link); otherwise none.';
  return [
    "You are a short-form video editor. A creator filmed themselves talking; you plan a light edit from the transcript.",
    `The video is ${o.durationSec.toFixed(1)} seconds long. Times are in seconds.`,
    o.zooms === false
      ? "Do not add zooms (zooms: [])."
      : "zooms: quick punch-ins on 3-8 key moments (a strong word, a reveal, a number). Each 0.8-2.5 s long, at least 3 s apart, never in the first 0.5 s.",
    "cards: 1-4 short cards shown over the lower middle of the video while the creator says that thing. Each 2.5-5 s, not overlapping:",
    '- "point": the key idea in a few words (text; highlight = 1-2 words of text to colour).',
    '- "list": when the creator lists things (heading, 2-4 items).',
    '- "stat": only a number the creator actually says (value, optional prefix like "₹", suffix like "%", label). Never invent numbers.',
    `- "cta": ${ending}`,
    "Write card text in the same language and script as the transcript. Keep it shorter than what is said.",
    "title: a short title for the video in the transcript's language.",
    'Reply with JSON only: {"title":string,"zooms":[{"start":n,"end":n}],"cards":[{"type":...,"start":n,"end":n,...}]}',
    "",
    "Transcript:",
    timedTranscript(o.words),
  ].join("\n");
}

// Keeps the AI's plan inside the video and readable: clamps times, drops overlaps and tiny spans,
// and enforces the creator's ending choice.
export function sanitizePlan(plan: EditPlan, durationSec: number, ending: Ending = "auto"): EditPlan {
  const clampSpan = <T extends { start: number; end: number }>(x: T): T => ({ ...x, start: Math.max(0, Math.min(x.start, durationSec)), end: Math.max(0, Math.min(x.end, durationSec)) });
  const zooms = plan.zooms
    .map(clampSpan)
    .filter((z) => z.end - z.start >= 0.5)
    .map((z) => ({ ...z, end: Math.min(z.end, z.start + 3) }))
    .sort((a, b) => a.start - b.start)
    .reduce<{ start: number; end: number }[]>((kept, z) => (kept.length && z.start < kept[kept.length - 1].end + 1 ? kept : [...kept, z]), []);
  let cards = plan.cards
    .map(clampSpan)
    .filter((c) => c.end - c.start >= 1.5)
    .filter((c) => !(ending === "none" && c.type === "cta"))
    .sort((a, b) => a.start - b.start)
    .reduce<Card[]>((kept, c) => (kept.length && c.start < kept[kept.length - 1].end ? kept : [...kept, c]), []);
  if (cards.length > 4) cards = cards.slice(0, 4);
  return { ...plan, zooms, cards };
}
