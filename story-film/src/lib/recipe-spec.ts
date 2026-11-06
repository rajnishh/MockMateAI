import { z } from "zod";
import { VOICES } from "@/lib/edit/audio";
import { type EditState } from "@/lib/edit/state";
import { DANCE_MOVES, DANCE_SCENES, DANCE_VOICES, type DanceScript, HAIR, OUTFITS, SKIN_TONES } from "@/lib/dance/script";
import { ENDINGS, MOTION_THEMES, type MotionScript, slideSchema } from "@/lib/motion/script";
import { STYLE_IDS } from "@/lib/styles";

// What a reel recipe keeps (design/community/recipes-spec.md, "What a recipe stores"): only things
// the pipelines can replay and that say nothing about the maker. Never the idea, narration, title,
// characters, a saved character, photos, uploaded video, voice, brand kit, keyword, lyrics or captions.
// No database or file access here, so the rules are easy to test.

export const SHAPE_ROLES = ["hook", "beat", "turn", "payoff", "cta"] as const;
export type ShapeRole = (typeof SHAPE_ROLES)[number];

const line = z.string().trim().min(1).max(80);
export const shapeSchema = z.object({
  tone: z.string().trim().max(24).catch("warm"),
  pace: z.enum(["slow", "steady", "quick"]).catch("steady"),
  shots: z.array(z.object({ role: z.enum(SHAPE_ROLES), intent: line, camera: line })).min(1).max(12),
});
export type RecipeShape = z.infer<typeof shapeSchema>;

type Slide = z.infer<typeof slideSchema>;
export type SlideType = Slide["type"];
// Same types as slideSchema in src/lib/motion/script.ts.
const SLIDE_TYPES = ["title", "list", "stat", "quote", "contrast", "chart", "compare", "timer", "question", "cta"] as const satisfies readonly SlideType[];

// The effect mix of an edit, per minute of video: "a big word every ~8 s" is backdrop 7.5.
const mixSchema = z.record(z.string(), z.number().min(0).max(60));

export const recipeSpecSchema = z.discriminatedUnion("format", [
  z.object({
    v: z.literal(1),
    format: z.literal("story"),
    style: z.enum(STYLE_IDS),
    durationSec: z.number().int().min(10).max(60),
    quality: z.enum(["standard", "premium", "cinematic"]),
    captions: z.boolean(),
    kidSafe: z.boolean(),
    shape: shapeSchema,
    // Display text for each shot's intent, by app language (the English is the prompt's).
    intentI18n: z.record(z.string(), z.array(z.string().max(120))).default({}),
    musicPrompt: z.string().max(300),
  }),
  z.object({
    v: z.literal(1),
    format: z.literal("motion"),
    durationSec: z.number().int().min(10).max(60),
    theme: z.enum(MOTION_THEMES),
    slides: z.array(z.enum(SLIDE_TYPES)).min(2).max(12),
    ending: z.enum(ENDINGS),
  }),
  z.object({
    v: z.literal(1),
    format: z.literal("dance"),
    durationSec: z.number().int().min(10).max(60),
    scene: z.enum(DANCE_SCENES),
    bpm: z.number().int().min(90).max(140),
    // Cartoon dancers' looks only, never their names.
    dancers: z.array(z.object({ skin: z.enum(SKIN_TONES), outfit: z.enum(OUTFITS), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), hair: z.enum(HAIR) }).strict()).min(1).max(4),
    moves: z.array(z.enum(DANCE_MOVES)).min(1).max(8),
    voice: z.enum(DANCE_VOICES),
  }),
  z.object({
    v: z.literal(1),
    format: z.literal("edit"),
    durationSec: z.number().int().min(3).max(60),
    captions: z.boolean(),
    zooms: z.boolean(),
    effects: z.boolean(),
    sounds: z.boolean(),
    voice: z.enum(VOICES),
    ending: z.enum(ENDINGS),
    // Which effect and card types, and how often (per minute). Never their text or timings.
    mix: z.object({ effects: mixSchema, cards: mixSchema }),
  }),
]);
export type RecipeSpec = z.infer<typeof recipeSpecSchema>;
export type RecipeFormat = RecipeSpec["format"];

// What the worker gets with a recipe reel: the parts its pipeline follows, and the recipe's track.
export interface RecipeJob {
  shape?: RecipeShape;
  musicPrompt?: string;
  slidePlan?: { theme: MotionScript["theme"]; slides: SlideType[] };
  dancePlan?: Omit<Extract<RecipeSpec, { format: "dance" }>, "v" | "format" | "durationSec" | "voice">;
  editMix?: Extract<RecipeSpec, { format: "edit" }>["mix"];
  musicPath?: string;
}

export function recipeJob(spec: RecipeSpec, musicPath?: string | null): RecipeJob {
  const music = musicPath ? { musicPath } : {};
  switch (spec.format) {
    case "story":
      return { shape: spec.shape, musicPrompt: spec.musicPrompt, ...music };
    case "motion":
      return { slidePlan: { theme: spec.theme, slides: spec.slides }, ...music };
    case "dance":
      return { dancePlan: { scene: spec.scene, bpm: spec.bpm, dancers: spec.dancers, moves: spec.moves } };
    case "edit":
      return { editMix: spec.mix };
  }
}

// ---------- Building the snapshot ----------

// What the maker's reel left behind: the film row's look, and the work dir's saved script or plan.
export interface RecipeSource {
  film: { format: RecipeFormat | "music"; style: string; durationSec: number; quality: "standard" | "premium" | "cinematic"; kidSafe: boolean };
  // script.json for story, motion and dance reels.
  script?: unknown;
  // edit.json for "Edit my video".
  edit?: EditState;
  // How a dance reel was voiced (timing.json); "sung" when unknown.
  danceVoice?: (typeof DANCE_VOICES)[number];
  // Written by the text AI at draft time (story reels).
  shape?: RecipeShape;
  intentI18n?: Record<string, string[]>;
}

// How a motion reel ended, read from its last slide (the job's choice isn't kept on the film).
function motionEnding(s: MotionScript): Extract<RecipeSpec, { format: "motion" }>["ending"] {
  const last = s.slides.at(-1);
  if (last?.type !== "cta") return "none";
  return /^comment\b/i.test(last.action ?? "") ? "comment" : "follow";
}

const perMinute = (items: { type: string }[], sec: number) => {
  const out: Record<string, number> = {};
  for (const i of items) out[i.type] = (out[i.type] ?? 0) + 1;
  for (const k of Object.keys(out)) out[k] = Math.round((out[k] * 60 * 10) / Math.max(sec, 1)) / 10;
  return out;
};

// The recipe's spec from a finished reel. Throws when the reel's saved script is missing or isn't
// the shape this format needs (the share sheet says "Couldn't read this reel's script").
export function buildRecipeSpec(src: RecipeSource): RecipeSpec {
  const f = src.film;
  const sec = Math.round(f.durationSec);
  let spec: unknown;
  if (f.format === "story") {
    const script = src.script as { musicPrompt?: string } | undefined;
    if (!src.shape) throw new Error("No script shape");
    spec = { v: 1, format: "story", style: f.style, durationSec: sec, quality: f.quality, captions: true, kidSafe: f.kidSafe, shape: src.shape, intentI18n: src.intentI18n ?? {}, musicPrompt: (script?.musicPrompt ?? "").slice(0, 300) };
  } else if (f.format === "motion") {
    const s = src.script as MotionScript;
    if (!s?.slides?.length) throw new Error("No slides");
    spec = { v: 1, format: "motion", durationSec: sec, theme: s.theme, slides: s.slides.map((x: Slide) => x.type), ending: motionEnding(s) };
  } else if (f.format === "dance") {
    const s = src.script as DanceScript;
    if (!s?.lines?.length) throw new Error("No chant");
    spec = {
      v: 1,
      format: "dance",
      durationSec: sec,
      scene: s.scene,
      bpm: s.bpm,
      dancers: s.dancers.map((d) => ({ skin: d.skin, outfit: d.outfit, color: d.color, hair: d.hair })),
      moves: s.lines.map((l) => l.move),
      voice: src.danceVoice ?? "sung",
    };
  } else if (f.format === "edit") {
    const e = src.edit;
    if (!e) throw new Error("No edit plan");
    const r = e.request;
    spec = {
      v: 1,
      format: "edit",
      durationSec: Math.min(60, Math.max(3, Math.round(e.durationSec))),
      captions: r.captions !== false,
      zooms: r.zooms !== false,
      effects: r.effects !== false,
      sounds: r.sounds !== false,
      voice: r.voice ?? "natural",
      // The keyword is the maker's own; a "comment" ending asks the user for theirs.
      ending: r.ending ?? "auto",
      mix: { effects: perMinute(e.plan.effects, e.durationSec), cards: perMinute(e.plan.cards, e.durationSec) },
    };
  } else throw new Error("Music videos can't be shared as recipes");
  return recipeSpecSchema.parse(spec);
}

// ---------- The shape writer ----------

// Asks the text AI for the script shape of a story reel: one abstract intent and a camera move per
// shot, with no names, numbers, places or brands, plus a topic hint for the user's Create screen.
export function buildShapePrompt(script: { shots: { narration: string; motionPrompt: string }[] }, displayLang?: string): string {
  return [
    "You turn a short video's script into a reusable recipe that other people fill with their own topic.",
    `Describe each of its ${script.shots.length} shots, in order, with:`,
    `- role: one of ${SHAPE_ROLES.join(", ")} (the first is "hook", the last "payoff" or "cta"),`,
    "- intent: what the shot does for the story, in at most 80 characters, about ANY topic (e.g. \"Open on a surprising question about the topic\"),",
    "- camera: the camera move, in at most 80 characters (from the motion description).",
    "Never use names, numbers, places, brands or anything specific to this video's story. English only.",
    "Also: tone (one word, e.g. warm, funny, dramatic), pace (slow, steady or quick), and topicHint: a short placeholder of example",
    'topics someone could use this recipe for (at most 80 characters, e.g. "A Diwali memory, your shop, your family…").',
    ...(displayLang && displayLang !== "en" ? [`Also intentDisplay: each intent translated to the language with code "${displayLang}", in its native script.`] : []),
    'Reply with JSON only: {"tone":string,"pace":string,"shots":[{"role":string,"intent":string,"camera":string}],"topicHint":string' + (displayLang && displayLang !== "en" ? ',"intentDisplay":[string]' : "") + "}",
    "",
    "Script:",
    ...script.shots.map((s, i) => `Shot ${i + 1}: ${s.narration} [camera: ${s.motionPrompt}]`),
  ].join("\n");
}

export class ShapeError extends Error {}

const words = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);

// Checks the writer's reply: the right number of shots, and none of the reel's own names or
// words that only belong to it (characters, title) and no digits. Fails closed.
export function checkShape(raw: unknown, script: { title?: string; characters?: { name: string }[]; shots: unknown[] }): { shape: RecipeShape; topicHint: string; intentDisplay?: string[] } {
  const r = raw as { topicHint?: unknown; intentDisplay?: unknown } | null;
  const parsed = shapeSchema.safeParse(raw);
  if (!parsed.success || parsed.data.shots.length !== script.shots.length) throw new ShapeError("The shape didn't match the reel");
  const topicHint = typeof r?.topicHint === "string" ? r.topicHint.trim().slice(0, 80) : "";
  const banned = new Set([...(script.characters ?? []).flatMap((c) => words(c.name)), ...words(script.title ?? "").filter((w) => w.length >= 4)]);
  const texts = [...parsed.data.shots.flatMap((s) => [s.intent, s.camera]), topicHint];
  for (const t of texts) {
    if (/\d/.test(t)) throw new ShapeError("The shape has numbers in it");
    const hit = words(t).find((w) => banned.has(w));
    if (hit) throw new ShapeError("The shape names something from the reel");
  }
  const display = Array.isArray(r?.intentDisplay) && r.intentDisplay.length === parsed.data.shots.length && r.intentDisplay.every((x) => typeof x === "string") ? (r.intentDisplay as string[]).map((x) => x.slice(0, 120)) : undefined;
  return { shape: parsed.data, topicHint, intentDisplay: display };
}

// The extra block for the story writer: follow this shape exactly.
export function shapeRules(shape: RecipeShape): string[] {
  return [
    `Follow this shape exactly (tone: ${shape.tone}, pace: ${shape.pace}), with the user's idea as the topic:`,
    ...shape.shots.map((s, i) => `Shot ${i + 1} is the ${s.role}: ${s.intent}`),
    "Each shot's motionPrompt starts with its camera move: " + shape.shots.map((s, i) => `shot ${i + 1} "${s.camera}"`).join(", ") + ".",
  ];
}

// "Hook → 4 beats → Payoff" as data: the middle shots are counted together.
export function shapeSummary(shape: RecipeShape): { first: ShapeRole; middle: number; last: ShapeRole } {
  const first = shape.shots[0].role;
  const last = shape.shots.length > 1 ? shape.shots[shape.shots.length - 1].role : first;
  return { first, middle: Math.max(0, shape.shots.length - 2), last };
}

// ---------- Locked and free fields on "Use this recipe" ----------

export class RecipeLockError extends Error {}

const LOCKED: Record<RecipeFormat, string[]> = {
  story: ["format", "style", "durationSec", "kidSafe", "captions"],
  motion: ["format", "durationSec", "ending"],
  dance: ["format", "durationSec", "danceVoice", "kidSafe"],
  edit: ["captions", "zooms", "effects", "sounds", "voice", "ending"],
};

// Ready-made scripts would skip the recipe's shape, so they can't come with one.
const NOT_WITH_RECIPE = ["script", "motionScript", "danceScript", "characterId"];

// The values the recipe sets, as a request's fields.
export function lockedValues(spec: RecipeSpec): Record<string, unknown> {
  switch (spec.format) {
    case "story":
      return { format: "story", style: spec.style, durationSec: spec.durationSec, kidSafe: spec.kidSafe, captions: spec.captions };
    case "motion":
      return { format: "motion", durationSec: spec.durationSec, ending: spec.ending };
    case "dance":
      return { format: "dance", durationSec: spec.durationSec, danceVoice: spec.voice, kidSafe: true };
    case "edit":
      return { captions: spec.captions, zooms: spec.zooms, effects: spec.effects, sounds: spec.sounds, voice: spec.voice, ending: spec.ending };
  }
}

// A request made with a recipe: the recipe's locked values over the user's own (topic, photo,
// language, quality, brand kit). A request that sends a different locked value is refused: to
// change it, the user makes the reel without the recipe.
export function applyRecipe(body: Record<string, unknown>, spec: RecipeSpec): Record<string, unknown> {
  const locked = lockedValues(spec);
  for (const k of LOCKED[spec.format]) {
    const sent = body[k];
    if (sent !== undefined && sent !== null && sent !== locked[k]) throw new RecipeLockError(`This recipe sets the ${LOCK_NAME[k] ?? k}. Make it without the recipe to change it.`);
  }
  for (const k of NOT_WITH_RECIPE) if (body[k] !== undefined && body[k] !== null) throw new RecipeLockError("A recipe reel writes its own script from your topic. Make it without the recipe to use your own.");
  const out: Record<string, unknown> = { ...body, ...locked };
  delete out.recipe;
  // A "comment" ending needs the user's own word; without one the AI decides.
  if (out.ending === "comment" && !(typeof body.keyword === "string" && body.keyword.trim())) out.ending = "auto";
  return out;
}

const LOCK_NAME: Record<string, string> = { format: "kind of reel", style: "look", durationSec: "length", kidSafe: "kids setting", captions: "captions", ending: "ending", danceVoice: "voice", zooms: "zooms", effects: "effects", sounds: "sounds", voice: "voice polish" };
