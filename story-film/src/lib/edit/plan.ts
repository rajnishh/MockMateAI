import { z } from "zod";
import type { Ending } from "@/lib/motion/script";
import type { TimedWord } from "@/lib/providers/whisper";
import type { Cue } from "./audio";

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

// Effects that know where the creator is in the frame (face box and person mask).
export const effectSchema = z.discriminatedUnion("type", [
  // One or two big words drawn behind the creator.
  z.object({ type: z.literal("backdrop"), text: z.string().min(1).max(16), ...span }),
  // The background dims and the creator is lit, for a key line.
  z.object({ type: z.literal("spotlight"), ...span }),
  // The creator pops out as a sticker with a white outline over a brand-colour background.
  z.object({ type: z.literal("cutout"), ...span }),
  // A rubber stamp slammed beside the face ("MYTH", "SAVED").
  z.object({ type: z.literal("stamp"), text: z.string().min(1).max(16), ...span }),
  // Corner brackets lock on to the face, with an optional short label.
  z.object({ type: z.literal("focus"), label: z.string().max(24).optional(), ...span }),
]);

export const EFFECT_TYPES = ["backdrop", "spotlight", "cutout", "stamp", "focus"] as const;
// These need the person mask; the rest only need the face box.
export const MASK_EFFECTS = new Set(["backdrop", "spotlight", "cutout"]);

export const editPlanSchema = z.object({
  title: z.string().min(1).max(100),
  zooms: z.array(z.object(span)).max(20).default([]),
  cards: z.array(cardSchema).max(6).default([]),
  effects: z.array(effectSchema).max(10).default([]),
});

export type Effect = z.infer<typeof effectSchema>;
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
  effects?: boolean;
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
    ...(o.effects
      ? [
          "effects: 2-5 face-aware effects on the strongest moments, 1-3.5 s each, not overlapping each other or any card:",
          '- "backdrop": one or two big words (text, max 16 characters) shown behind the creator when they say a key word.',
          '- "spotlight": the background dims to focus on a key line or a secret.',
          '- "cutout": the creator pops out as a sticker on a colour background, for a reveal or a big claim.',
          '- "stamp": a short verdict stamped beside the face (text, max 16 characters, e.g. "MYTH", "TRUE", "SAVED").',
          '- "focus": brackets lock on to the face when the creator talks about themselves (optional short label).',
          "Never put two effects back to back; leave the video plain in between.",
        ]
      : ["effects: []"]),
    "Write card and effect text in the same language and script as the transcript. Keep it shorter than what is said.",
    "title: a short title for the video in the transcript's language.",
    'Reply with JSON only: {"title":string,"zooms":[{"start":n,"end":n}],"cards":[{"type":...,"start":n,"end":n,...}],"effects":[{"type":...,"start":n,"end":n,...}]}',
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
    .map((c) => ({ ...c, end: Math.min(c.end, c.start + 8) }))
    .filter((c) => !(ending === "none" && c.type === "cta"))
    .sort((a, b) => a.start - b.start)
    .reduce<Card[]>((kept, c) => (kept.length && c.start < kept[kept.length - 1].end ? kept : [...kept, c]), []);
  if (cards.length > 4) cards = cards.slice(0, 4);
  // Text effects never share the screen with a card; nothing overlaps another effect.
  const effects = plan.effects
    .map(clampSpan)
    .filter((e) => e.end - e.start >= 0.8)
    .map((e) => ({ ...e, end: Math.min(e.end, e.start + 4) }))
    .filter((e) => !((e.type === "backdrop" || e.type === "stamp") && cards.some((c) => e.start < c.end && c.start < e.end)))
    .sort((a, b) => a.start - b.start)
    .reduce<Effect[]>((kept, e) => (kept.length && e.start < kept[kept.length - 1].end + 0.5 ? kept : [...kept, e]), [])
    .slice(0, 6);
  return { ...plan, zooms, cards, effects };
}

// Drops effects the analysis can't support: no mask → no mask effects; no face → none.
export function supportedEffects(effects: Effect[], vision: { mask: boolean; faces: boolean }): Effect[] {
  return effects.filter((e) => vision.faces && (vision.mask || !MASK_EFFECTS.has(e.type)));
}

const CUE: Record<Effect["type"] | Card["type"], Cue["sound"]> = {
  backdrop: "boom",
  spotlight: "shimmer",
  cutout: "whoosh",
  stamp: "stamp",
  focus: "tick",
  point: "pop",
  list: "pop",
  stat: "ding",
  cta: "pop",
};

// Sound effects follow the edit: a whoosh on punch-ins, a pop when a card appears, and so on.
export function soundCues(plan: EditPlan): Cue[] {
  const cues: Cue[] = [
    ...plan.zooms.map((z) => ({ sound: "whoosh" as const, at: Math.max(0, z.start - 0.15), volume: 0.3 })),
    ...plan.cards.map((c) => ({ sound: CUE[c.type], at: c.start, volume: 0.45 })),
    ...plan.effects.map((e) => ({ sound: CUE[e.type], at: e.type === "stamp" ? e.start + 0.15 : e.start, volume: e.type === "backdrop" || e.type === "stamp" ? 0.7 : 0.45 })),
  ].sort((a, b) => a.at - b.at);
  // Never two sounds within a quarter second.
  return cues.reduce<Cue[]>((kept, c) => (kept.length && c.at - kept[kept.length - 1].at < 0.25 ? kept : [...kept, c]), []);
}
