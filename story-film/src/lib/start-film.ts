import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PREMIUM_CREDITS_PER_SHOT, STANDARD_CREDITS } from "@/lib/billing/catalog";
import { spendCredits } from "@/lib/billing/credits";
import { getCharacter } from "@/lib/characters";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { createFilm } from "@/lib/films";
import { findLanguage } from "@/lib/languages";
import { buildTts, premiumAvailable } from "@/lib/providers";
import { filmJobSchema, getFilmQueue, getRedis } from "@/lib/queue/films";
import { FREE_PLAN, isoWeekKey, shotCountFor } from "@/lib/quota/plans";
import { RedisQuotaStore, reserveFilm } from "@/lib/quota/quota";

// Why a film couldn't start; needCredits means buying credits would fix it.
export class StartError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly needCredits = false,
  ) {
    super(message);
  }
}

// Starts a story or motion reel for a user: checks, charges (free weekly allowance first) and queues
// it. Shared by the app's Create screen and the Ask Reelkar agent, so both follow the same rules.
export async function startFilm(userId: string, body: unknown): Promise<{ id: string; credits: number }> {
  const parsed = filmJobSchema.safeParse({ ...(body as object), userId });
  if (!parsed.success) throw new StartError(z.prettifyError(parsed.error));
  const env = loadEnv();
  const db = getDb();
  // Motion reels use no image or video models, so they are always priced as standard videos.
  if (parsed.data.format === "motion") parsed.data.quality = "standard";
  const { quality, durationSec } = parsed.data;
  if (quality === "premium" && !premiumAvailable(env)) throw new StartError("AI animation isn't available yet");

  // Refuse before charging if this server can't speak the chosen language.
  const { language } = parsed.data;
  if (language !== "auto" && !buildTts(env).supports(language)) {
    throw new StartError(`Narration in ${findLanguage(language)?.name ?? language} isn't available yet`);
  }

  let character;
  if (parsed.data.characterId) {
    character = await getCharacter(db, userId, parsed.data.characterId);
    if (!character) throw new StartError("Character not found", 404);
  }

  // Standard videos use the free weekly allowance first, then 1 credit.
  // Premium (AI animation) always costs credits per shot.
  const filmId = randomUUID();
  const plan = { ...FREE_PLAN, filmsPerWeek: env.FREE_FILMS_PER_WEEK };
  let quotaKey: string | undefined;
  let credits = 0;
  if (quality === "standard") {
    const quota = await reserveFilm(new RedisQuotaStore(getRedis()), userId, durationSec, plan);
    if (quota.ok) quotaKey = quota.key;
    else credits = STANDARD_CREDITS;
  } else {
    credits = shotCountFor(durationSec) * PREMIUM_CREDITS_PER_SHOT;
  }
  if (credits > 0 && !(await spendCredits(db, userId, credits, filmId))) {
    throw new StartError(
      quality === "standard"
        ? `You've used this week's ${plan.filmsPerWeek} free videos. Buy credits to keep creating.`
        : `AI animation needs ${credits} credits for this length.`,
      402,
      true,
    );
  }

  const film = await createFilm(db, {
    id: filmId,
    userId,
    characterId: character?.id,
    story: parsed.data.story,
    style: parsed.data.style,
    format: parsed.data.format,
    durationSec,
    kidSafe: parsed.data.kidSafe,
    quality,
    credits,
  });
  await getFilmQueue().add(
    "film",
    {
      ...parsed.data,
      character,
      // Paid videos have no watermark beyond the AI label.
      resolution: plan.resolution,
      watermark: credits === 0,
      quotaKey,
      credits,
    },
    { jobId: film.id },
  );
  return { id: film.id, credits };
}

// Free standard reels left this week.
export async function freeReelsLeft(userId: string, now = new Date()): Promise<number> {
  const used = Number((await getRedis().get(`quota:films:${userId}:${isoWeekKey(now)}`)) ?? 0);
  return Math.max(0, loadEnv().FREE_FILMS_PER_WEEK - used);
}
