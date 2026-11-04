import type { Redis } from "ioredis";

// Fixed-window counter per user; returns false once the limit is reached.
export async function allow(redis: Redis, key: string, limit: number, windowSec: number): Promise<boolean> {
  const [[, count]] = (await redis.multi().incr(key).expire(key, windowSec, "NX").exec()) as [[null, number]];
  return count <= limit;
}
