import { ENDINGS } from "@/lib/motion/script";
import { STYLE_IDS } from "@/lib/styles";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { z } from "zod";
import { loadEnv } from "@/lib/env";
import { LANGUAGE_CODES } from "@/lib/languages";
import type { CharacterProfile } from "@/lib/providers/types";

export const FILM_QUEUE = "films";

export const filmJobSchema = z.object({
  userId: z.string().min(1),
  story: z.string().min(20).max(8000),
  style: z.enum(STYLE_IDS),
  durationSec: z.number().int().min(10).max(60),
  referenceImageUrls: z.array(z.url()).max(4).default([]),
  characterId: z.uuid().optional(),
  kidSafe: z.boolean().default(false),
  language: z.enum(["auto", ...LANGUAGE_CODES]).default("auto"),
  captions: z.boolean().default(true),
  quality: z.enum(["standard", "premium"]).default("standard"),
  // "motion" reels are animated text slides with a voice-over: always standard quality.
  format: z.enum(["story", "motion"]).default("story"),
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
  resolution: "480p" | "720p";
  watermark: boolean;
  // If the film ultimately fails: the free weekly slot is released, credits refunded.
  quotaKey?: string;
  credits: number;
};

export const musicVideoRequestSchema = z.object({
  style: z.enum(STYLE_IDS).default("animated"),
  quality: z.enum(["standard", "premium"]).default("standard"),
  characterId: z.uuid().optional(),
  kidSafe: z.boolean().default(false),
  captions: z.boolean().default(true),
});

// Music videos share the films queue (job name "music-video") and the film table.
export type MusicVideoJob = z.infer<typeof musicVideoRequestSchema> & {
  userId: string;
  songId: string;
  songFile: string;
  title: string;
  lyrics: string;
  genre: string;
  mood: string;
  character?: CharacterProfile;
  resolution: "480p" | "720p";
  watermark: boolean;
  credits: number;
};

// Options for "Edit my video", sent as form fields with the upload.
export const editRequestSchema = z.object({
  language: z.enum(["auto", ...LANGUAGE_CODES]).default("auto"),
  captions: z.boolean().default(true),
  zooms: z.boolean().default(true),
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

export type FilmQueueJob = FilmJob | MusicVideoJob | EditJob;

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
