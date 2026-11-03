import { z } from "zod";
import { DANCE_VOICES, danceScriptSchema } from "@/lib/dance/script";
import { ENDINGS, motionScriptSchema } from "@/lib/motion/script";
import { STYLE_IDS } from "@/lib/styles";

// Everything Ask Reelkar can do. The same list (names, descriptions and input schemas) will be
// offered to Claude, ChatGPT and other assistants as connector tools, so keep descriptions plain.

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/);
// A reel: "R1" = newest of the creator's reels, "N1" = first reel made in this same reply,
// "latest", or a reel id.
const reelRef = z.string().trim().min(1).max(60).default("latest");
const format = z.enum(["story", "motion", "dance"]).catch("motion");
const duration = z.coerce.number().pipe(z.union([z.literal(15), z.literal(30), z.literal(60)])).catch(30);
const language = z.string().trim().min(2).max(10).optional();

export const ACTIONS = {
  suggest_ideas: {
    description: "Suggest reel ideas for the creator's topic.",
    input: z.object({ topic: z.string().trim().max(100).optional(), language, count: z.coerce.number().int().min(1).max(6).catch(3), format }),
  },
  make_reel: {
    description:
      'Make one reel. format "motion": animated text, tips, lists and numbers with a voice-over; "story": a narrated story with pictures; "dance": cartoon kids dancing to a dhol beat with a chant, for young children. idea: 1-3 sentences the video is made from.',
    input: z.object({
      idea: z.string().trim().min(20).max(2000),
      title: z.string().trim().max(80).optional(),
      format,
      language,
      durationSec: duration,
      style: z.enum(STYLE_IDS).optional(),
      ending: z.enum(ENDINGS).optional(),
    }),
  },
  make_reel_from_script: {
    description:
      "Make a story reel from a script you wrote: Reelkar makes the pictures, motion, voice, music and captions exactly from it. " +
      "3 shots = 15s, 6 = 30s, 12 = 60s; each shot is 5 seconds. narration: what the voice says (about 12 words, in the reel's language). " +
      "imagePrompt (English): one picture, describing each recurring character the same way every time. motionPrompt (English): camera and subject movement. " +
      "musicPrompt (English): one instrumental track. Set kidSafe for children's content. " +
      "characterId: the creator's saved character, if they gave you one; Reelkar keeps that character's look in every picture.",
    connectorOnly: true,
    input: z.object({
      title: z.string().trim().min(1).max(80),
      language: z.string().trim().min(2).max(10).default("en"),
      style: z.enum(STYLE_IDS).default("animated"),
      kidSafe: z.boolean().default(false),
      characterId: z.uuid().optional(),
      characters: z.array(z.object({ name: z.string().trim().min(1).max(40), description: z.string().trim().min(1).max(300) })).max(5).default([]),
      shots: z
        .array(
          z.object({
            narration: z.string().trim().max(200),
            imagePrompt: z.string().trim().min(10).max(800),
            motionPrompt: z.string().trim().min(3).max(300),
          }),
        )
        .refine((s) => [3, 6, 12].includes(s.length), "Use 3, 6 or 12 shots (15, 30 or 60 seconds)"),
      musicPrompt: z.string().trim().min(3).max(300),
    }),
  },
  make_motion_reel_from_script: {
    description:
      "Make a motion reel from slides you wrote: bold animated text with a voice-over (tips, lists, numbers, quotes), no AI pictures, so it's free. " +
      "Reelkar animates and voices the slides exactly as written. About one slide per 5-6 seconds of reel, 2-12 slides. Start with a \"title\" slide " +
      "(headline, optional highlight copied from it, optional sub). Slide types: title, list (heading, 2-5 items), stat (value number, optional prefix/suffix, label), " +
      "chart (label, 2-8 values in order, optional suffix), compare (before/after each {label, value}), contrast (before, after), timer (seconds, label), " +
      "question (text), quote (text, optional real author), cta (text, optional action). Every slide has narration (what the voice says, up to ~25 words, in the reel's language). " +
      "Numbers must be real or given by the creator; never invent statistics or quotes. theme: navy, saffron, mint or night. ending: none, follow, comment or auto.",
    connectorOnly: true,
    input: motionScriptSchema.extend({ ending: z.enum(ENDINGS).catch("auto"), keyword: z.string().trim().max(20).optional() }),
  },
  make_dance_reel: {
    description:
      "Make a dance reel from a chant you wrote: cartoon Indian kids dance to a dhol beat while a voice sings your lines on the beat, with bouncing captions. " +
      "Reelkar draws the kids and makes the beat, so it's free. " +
      'voice: "sung" (default, free: your lines sung to a simple kids\' tune), "chant" (free: spoken on the beat) or ' +
      '"ai_song" (an AI singer sings them as a real song; costs 4 credits, so use it only when the creator asks for it). ' +
      "lines: 2-6 short bouncy lines (3-7 words), each with a move (bounce, clap, wave, spin, jump, twist); " +
      "they repeat like a chorus until the reel is full. Write an original hook; never copy lyrics from existing songs. " +
      "dancers: 1-4 kids, each with name, skin (light|medium|deep), outfit (kurta|lehenga|frock|shirt), color (hex) and hair (short|curly|ponytails|bun|plait). " +
      "scene: courtyard, park or stage. bpm: 90-140.",
    connectorOnly: true,
    input: danceScriptSchema.extend({ durationSec: duration, voice: z.enum(DANCE_VOICES).catch("sung") }),
  },
  get_reel: {
    description: "One reel's progress. When it's ready, gives a link to watch the video and a link that opens it in the Reelkar app.",
    input: z.object({ reel: reelRef }),
  },
  make_week: {
    description: "Make several reels on a topic (one per day). post: true to also post or schedule them, one a day from startDate.",
    input: z.object({
      topic: z.string().trim().max(100).optional(),
      count: z.coerce.number().int().min(1).max(7).catch(3),
      format,
      language,
      durationSec: duration,
      post: z.boolean().catch(false),
      time: time.optional(),
      startDate: date.optional(),
    }),
  },
  post_reel: {
    description: "Post or schedule a reel on the creator's connected Instagram/YouTube. Leave date/time out for the usual time; now: true to post right away.",
    input: z.object({
      reel: reelRef,
      platforms: z.array(z.enum(["instagram", "youtube"])).max(2).optional(),
      date: date.optional(),
      time: time.optional(),
      now: z.boolean().optional(),
    }),
  },
  write_caption: {
    description: "Write a caption and hashtags for a finished reel.",
    input: z.object({ reel: reelRef, platform: z.enum(["instagram", "youtube", "whatsapp"]).catch("instagram") }),
  },
  list_reels: {
    description: "Show the creator's recent reels and whether they are ready.",
    input: z.object({}),
  },
  change_edit: {
    description: 'Change a video the creator uploaded ("Edit my video") and render it again: voice "natural" | "clear" | "deeper", sound effects and captions on or off.',
    input: z.object({ reel: reelRef, voice: z.enum(["natural", "clear", "deeper"]).optional(), sounds: z.boolean().optional(), captions: z.boolean().optional() }),
  },
  set_posting_mode: {
    description: 'How posting works: "ask" (creator approves each post), "auto_schedule" (schedule at good times without asking), "auto_now" (post as soon as ready).',
    input: z.object({ mode: z.enum(["ask", "auto_schedule", "auto_now"]) }),
  },
} as const;

export type ActionName = keyof typeof ACTIONS;
export type ActionInput<N extends ActionName> = z.infer<(typeof ACTIONS)[N]["input"]>;
export const ACTION_NAMES = Object.keys(ACTIONS) as ActionName[];

export function isAction(name: string): name is ActionName {
  return name in ACTIONS;
}

// Actions only connected assistants get: Ask Reelkar's own planner writes ideas, not whole scripts.
export function isConnectorOnly(name: ActionName): boolean {
  return "connectorOnly" in ACTIONS[name];
}

// One line per action for the planner prompt: name, what it does and its fields.
export function describeActions(): string {
  return ACTION_NAMES.filter((name) => !isConnectorOnly(name)).map((name) => {
    const shape = (ACTIONS[name].input as z.ZodObject).shape as Record<string, z.ZodType>;
    const fields = Object.keys(shape).join(", ");
    return `- ${name} {${fields}}: ${ACTIONS[name].description}`;
  }).join("\n");
}
