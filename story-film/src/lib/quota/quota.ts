import type { Redis } from "ioredis";
import { FREE_PLAN, isoWeekKey, type Plan } from "./plans";

export interface QuotaStore {
  // Atomically increments the counter and returns the new value.
  increment(key: string, ttlSec: number): Promise<number>;
  decrement(key: string): Promise<void>;
}

export class RedisQuotaStore implements QuotaStore {
  constructor(private readonly redis: Redis) {}

  async increment(key: string, ttlSec: number): Promise<number> {
    const [[, count]] = (await this.redis.multi().incr(key).expire(key, ttlSec, "NX").exec()) as [[null, number]];
    return count;
  }

  async decrement(key: string): Promise<void> {
    await this.redis.decr(key);
  }
}

export type QuotaResult = { ok: true; key: string } | { ok: false; reason: string };

export async function reserveFilm(
  store: QuotaStore,
  userId: string,
  durationSec: number,
  plan: Plan = FREE_PLAN,
  now = new Date(),
): Promise<QuotaResult> {
  if (durationSec > plan.maxDurationSec) {
    return { ok: false, reason: `Films are limited to ${plan.maxDurationSec}s on this plan` };
  }
  const key = `quota:films:${userId}:${isoWeekKey(now)}`;
  const count = await store.increment(key, 8 * 24 * 3600);
  if (count > plan.filmsPerWeek) {
    await store.decrement(key);
    return { ok: false, reason: `Weekly limit of ${plan.filmsPerWeek} film(s) reached` };
  }
  return { ok: true, key };
}
