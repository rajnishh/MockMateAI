import { z } from "zod";
import { ENDINGS } from "@/lib/motion/script";
import { STYLE_IDS } from "@/lib/styles";

// Everything Ask Reelkar can do. The same list (names, descriptions and input schemas) will be
// offered to Claude, ChatGPT and other assistants as connector tools, so keep descriptions plain.

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/);
// A reel: "R1" = newest of the creator's reels, "N1" = first reel made in this same reply,
// "latest", or a reel id.
const reelRef = z.string().trim().min(1).max(60).default("latest");
const format = z.enum(["story", "motion"]).catch("motion");
const duration = z.coerce.number().pipe(z.union([z.literal(15), z.literal(30), z.literal(60)])).catch(30);
const language = z.string().trim().min(2).max(10).optional();

export const ACTIONS = {
  suggest_ideas: {
    description: "Suggest reel ideas for the creator's topic.",
    input: z.object({ topic: z.string().trim().max(100).optional(), language, count: z.coerce.number().int().min(1).max(6).catch(3), format }),
  },
  make_reel: {
    description:
      'Make one reel. format "motion": animated text, tips, lists and numbers with a voice-over; "story": a narrated story with pictures. idea: 1-3 sentences the video is made from.',
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

// One line per action for the planner prompt: name, what it does and its fields.
export function describeActions(): string {
  return ACTION_NAMES.map((name) => {
    const shape = (ACTIONS[name].input as z.ZodObject).shape as Record<string, z.ZodType>;
    const fields = Object.keys(shape).join(", ");
    return `- ${name} {${fields}}: ${ACTIONS[name].description}`;
  }).join("\n");
}
