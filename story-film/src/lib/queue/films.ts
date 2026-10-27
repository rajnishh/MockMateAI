import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { z } from "zod";
import { loadEnv } from "@/lib/env";

export const FILM_QUEUE = "films";

export const filmJobSchema = z.object({
  userId: z.string().min(1),
  story: z.string().min(20).max(8000),
  style: z.enum(["cinematic", "animated", "photoreal"]),
  durationSec: z.number().int().min(10).max(60),
  referenceImageUrls: z.array(z.url()).max(4).default([]),
});

export type FilmJob = z.infer<typeof filmJobSchema> & {
  resolution: "480p" | "720p";
  watermark: boolean;
  // Released if the film ultimately fails, so users don't lose their weekly film.
  quotaKey: string;
};

let redis: Redis | undefined;
let queue: Queue<FilmJob> | undefined;

export function getRedis(): Redis {
  // BullMQ requires maxRetriesPerRequest: null on its connections.
  redis ??= new Redis(loadEnv().REDIS_URL, { maxRetriesPerRequest: null });
  return redis;
}

export function getFilmQueue(): Queue<FilmJob> {
  queue ??= new Queue<FilmJob>(FILM_QUEUE, { connection: getRedis() });
  return queue;
}
