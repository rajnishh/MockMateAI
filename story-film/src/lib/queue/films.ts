import { VOICES } from "@/lib/edit/audio";
import { editPlanSchema } from "@/lib/edit/plan";
import { DANCE_VOICES, danceScriptSchema } from "@/lib/dance/script";
import { ENDINGS, motionScriptSchema } from "@/lib/motion/script";
import { filmScriptSchema } from "@/lib/pipeline/script";
import { STYLE_IDS } from "@/lib/styles";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { z } from "zod";
import { loadEnv } from "@/lib/env";
import { LANGUAGE_CODES } from "@/lib/languages";
import { PHOTO_ID } from "@/lib/photos";
import { DANCE_CLIP_ID } from "@/lib/music-video/dance";
import type { MusicVideoPhase } from "@/lib/music-video/pipeline";
import { DANCE_STYLES, MUSIC_VIDEO_KINDS, type MusicVideoKind } from "@/lib/music-video/shots";
import type { CharacterProfile, Resolution } from "@/lib/providers/types";

export const FILM_QUEUE = "films";

export const filmJobSchema = z.object({
  userId: z.string().min(1),
  story: z.string().min(20).max(8000),
  style: z.enum(STYLE_IDS),
  durationSec: z.number().int().min(10).max(60),
  // Public pictures only: a file:// or internal address would let a request read the server's files.
  referenceImageUrls: z.array(z.url({ protocol: /^https$/ })).max(4).default([]),
  // A photo the creator uploaded (POST /api/photos): the reel's lead looks like the person in it.
  photo: z.string().regex(PHOTO_ID).optional(),
  // The creator confirmed the photo is of them, or of someone who agreed to be in the reel.
  photoConsent: z.boolean().default(false),
  characterId: z.uuid().optional(),
  kidSafe: z.boolean().default(false),
  language: z.enum(["auto", ...LANGUAGE_CODES]).default("auto"),
  captions: z.boolean().default(true),
  // The visible "Created with AI" label and, on free reels, the Reelkar "free plan" mark. Both are the
  // creator's choice for now; a later admin dashboard decides whether to require them.
  aiLabel: z.boolean().default(true),
  reelkarMark: z.boolean().default(true),
  quality: z.enum(["standard", "premium", "cinematic"]).default("standard"),
  // "motion" reels are animated text slides with a voice-over, "dance" reels cartoon kids dancing to a
  // dhol beat with a chant: both drawn by Reelkar, so always standard quality.
  format: z.enum(["story", "motion", "dance"]).default("story"),
  // Story reels only: a script an assistant already wrote, used instead of writing one.
  script: filmScriptSchema.optional(),
  // Motion reels only: slides an assistant already wrote.
  motionScript: motionScriptSchema.optional(),
  // Dance reels only: a chant and dancers an assistant already wrote.
  danceScript: danceScriptSchema.optional(),
  // Dance reels only: "sung" (free) sings the chant to a tune, "chant" speaks it, "ai_song" (paid) has an AI sing it.
  danceVoice: z.enum(DANCE_VOICES).default("sung"),
  // Motion reels only: how the reel ends, and the creator's brand look.
  ending: z.enum(ENDINGS).default("auto"),
  keyword: z.string().trim().max(20).regex(/^[\p{L}\p{N}_-]*$/u, "One word, no spaces").optional(),
  brand: z
    .object({
      accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      background: z.enum(["light", "dark"]).optional(),
      handle: z.string().trim().max(30).optional(),
    })
    .optional(),
});

export type FilmJob = z.infer<typeof filmJobSchema> & {
  character?: CharacterProfile;
  // The uploaded photo's file, resolved for this user when the reel started.
  photoUrl?: string;
  resolution: Resolution;
  watermark: boolean;
  // If the film ultimately fails: the free weekly slot is released, credits refunded.
  quotaKey?: string;
  credits: number;
};

export const musicVideoRequestSchema = z.object({
  // Lyric video, story video, performance (the star sings, lip-synced) or the full music video.
  // Older clients send only quality and singer; musicVideoKind() maps those.
  kind: z.enum(MUSIC_VIDEO_KINDS).optional(),
  style: z.enum(STYLE_IDS).default("animated"),
  quality: z.enum(["standard", "premium", "cinematic"]).default("standard"),
  // The star is the person in this uploaded photo (POST /api/photos), with the creator's consent.
  photo: z.string().regex(PHOTO_ID).optional(),
  photoConsent: z.boolean().default(false),
  // Older clients' "Sing it yourself": now the performance kind.
  singer: z.boolean().default(false),
  characterId: z.uuid().optional(),
  kidSafe: z.boolean().default(false),
  captions: z.boolean().default(true),
  danceStyle: z.enum(DANCE_STYLES).default("bollywood"),
  // A clip of the creator dancing (POST /api/songs/[id]/music-video/dance-clip), with their consent.
  danceClip: z.string().regex(DANCE_CLIP_ID).optional(),
  danceClipConsent: z.boolean().default(false),
  // Only this part of the song, in seconds.
  range: z
    .object({ start: z.number().finite().min(0), end: z.number().finite().positive() })
    .refine((r) => r.end - r.start >= 3, "Pick at least 3 seconds of the song")
    .optional(),
  // Plan the shots and draw them first (free), then wait for the creator to check them.
  storyboard: z.boolean().default(false),
});

export type MusicVideoRequestBody = z.infer<typeof musicVideoRequestSchema>;

export function musicVideoKind(body: Pick<MusicVideoRequestBody, "kind" | "quality" | "singer">): MusicVideoKind {
  return body.kind ?? (body.singer ? "performance" : body.quality === "standard" ? "lyric" : "story");
}

// Music videos share the films queue (job name "music-video") and the film table. A storyboard
// job plans the shots and stops at "review"; its render job carries filmId, as its job id differs.
export type MusicVideoJob = MusicVideoRequestBody & {
  kind: MusicVideoKind;
  phase: MusicVideoPhase;
  filmId?: string;
  userId: string;
  songId: string;
  songFile: string;
  title: string;
  lyrics: string;
  genre: string;
  mood: string;
  character?: CharacterProfile;
  photoUrl?: string;
  danceClipFile?: string;
  resolution: Resolution;
  watermark: boolean;
  credits: number;
};

// Options for "Edit my video", sent as form fields with the upload.
export const editRequestSchema = z.object({
  language: z.enum(["auto", ...LANGUAGE_CODES]).default("auto"),
  captions: z.boolean().default(true),
  zooms: z.boolean().default(true),
  effects: z.boolean().default(true),
  sounds: z.boolean().default(true),
  voice: z.enum(VOICES).default("natural"),
  review: z.boolean().default(false),
  ending: z.enum(ENDINGS).default("auto"),
  keyword: z.string().trim().max(20).regex(/^[\p{L}\p{N}_-]*$/u, "One word, no spaces").optional(),
  brand: z
    .object({
      accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      background: z.enum(["light", "dark"]).optional(),
      handle: z.string().trim().max(30).optional(),
    })
    .optional(),
});

// Edits share the films queue (job name "edit") and the film table.
export type EditJob = z.infer<typeof editRequestSchema> & {
  userId: string;
  source: string;
  watermark: boolean;
  quotaKey?: string;
  credits: number;
};

// The creator's changes to a planned or finished edit.
export const editChangesSchema = z.object({
  plan: editPlanSchema,
  captions: z.boolean().optional(),
  sounds: z.boolean().optional(),
  voice: z.enum(VOICES).optional(),
  // Caption words with their times, after the creator fixed them.
  words: z
    .array(z.object({ word: z.string().trim().min(1).max(40), start: z.number().finite().min(0), end: z.number().finite().min(0) }))
    .max(3000)
    .optional(),
});

// Renders a saved edit plan (job name "edit-render"). Its job id is not the film id, so the film is named.
export interface EditRenderJob {
  filmId: string;
  userId: string;
  // After review the first render still carries the upload's charge (refunded if it fails);
  // re-renders of a finished video are free and keep the old video if they fail.
  rerender: boolean;
  credits: number;
  quotaKey?: string;
}

export type FilmQueueJob = FilmJob | MusicVideoJob | EditJob | EditRenderJob;

let redis: Redis | undefined;
let queue: Queue<FilmQueueJob> | undefined;

export function getRedis(): Redis {
  // BullMQ requires maxRetriesPerRequest: null on its connections.
  redis ??= new Redis(loadEnv().REDIS_URL, { maxRetriesPerRequest: null });
  return redis;
}

export function getFilmQueue(): Queue<FilmQueueJob> {
  queue ??= new Queue<FilmQueueJob>(FILM_QUEUE, { connection: getRedis() });
  return queue;
}
