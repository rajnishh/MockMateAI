import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { z } from "zod";
import { loadEnv } from "@/lib/env";
import type { CharacterProfile } from "@/lib/providers/types";

export const FILM_QUEUE = "films";

export const filmJobSchema = z.object({
  userId: z.string().min(1),
  story: z.string().min(20).max(8000),
  style: z.enum(["cinematic", "animated", "photoreal"]),
  durationSec: z.number().int().min(10).max(60),
  referenceImageUrls: z.array(z.url()).max(4).default([]),
  characterId: z.uuid().optional(),
  kidSafe: z.boolean().default(false),
  language: z.enum(["auto", "en", "hi"]).default("auto"),
  captions: z.boolean().default(true),
  quality: z.enum(["standard", "premium"]).default("standard"),
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
  style: z.enum(["cinematic", "animated", "photoreal"]).default("animated"),
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

export type FilmQueueJob = FilmJob | MusicVideoJob;

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
