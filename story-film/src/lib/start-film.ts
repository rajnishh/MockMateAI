import { randomUUID } from "node:crypto";
import { PREMIUM_CREDITS_PER_SHOT, STANDARD_CREDITS } from "@/lib/billing/catalog";
import { spendCredits } from "@/lib/billing/credits";
import { getCharacter } from "@/lib/characters";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { createFilm } from "@/lib/films";
import { findLanguage, normaliseLanguage } from "@/lib/languages";
import { buildTts, premiumAvailable } from "@/lib/providers";
import { filmJobSchema, getFilmQueue, getRedis } from "@/lib/queue/films";
import { FREE_PLAN, isoWeekKey, shotCountFor } from "@/lib/quota/plans";
import { RedisQuotaStore, reserveFilm } from "@/lib/quota/quota";
import { DEFAULT_STYLE, findStyle } from "@/lib/styles";

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

// What a creator reads when a request can't be used, by field.
const FIELD_ERRORS: Record<string, string> = {
  story: "Write what your reel is about: at least 20 characters, up to 8,000.",
  style: "Pick a style from the list.",
  durationSec: "Pick a length between 10 and 60 seconds.",
  characterId: "Pick your character again.",
  referenceImageUrls: "Add up to 4 pictures.",
  brand: "Your Brand kit settings aren't valid. Open Brand kit and save them again.",
};

// Checks a request from any app or assistant. Callers may leave out the style or send a language
// as "hi-IN" or "Hindi": the style falls back to the default (motion reels don't use one) and the
// language to its code, or "auto" when it isn't one Reelkar knows.
export function parseFilmRequest(userId: string, body: unknown) {
  const input = { ...(body && typeof body === "object" ? body : {}) } as Record<string, unknown>;
  const motion = input.format === "motion";
  const noStyle = input.style === undefined || input.style === null || input.style === "";
  input.style = motion || noStyle ? DEFAULT_STYLE : (findStyle(input.style) ?? input.style);
  input.language = normaliseLanguage(input.language);
  const parsed = filmJobSchema.safeParse({ ...input, userId });
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const field = String(issue.path[0] ?? "");
  // Messages written in the schema itself (like the keyword's) are already readable.
  throw new StartError(FIELD_ERRORS[field] ?? (issue.code === "custom" || field === "keyword" ? issue.message : "Something in this request isn't right. Please try again."));
}

// Starts a story or motion reel for a user: checks, charges (free weekly allowance first) and queues
// it. Shared by the app's Create screen and the Ask Reelkar agent, so both follow the same rules.
export async function startFilm(userId: string, body: unknown): Promise<{ id: string; credits: number }> {
  const job = parseFilmRequest(userId, body);
  const env = loadEnv();
  const db = getDb();
  // Motion reels use no image or video models, so they are always priced as standard videos.
  if (job.format === "motion") job.quality = "standard";
  const { quality, durationSec } = job;
  if (quality === "premium" && !premiumAvailable(env)) throw new StartError("AI animation isn't available yet");

  // Refuse before charging if this server can't speak the chosen language.
  const { language } = job;
  if (language !== "auto" && !buildTts(env).supports(language)) {
    throw new StartError(`Narration in ${findLanguage(language)?.name ?? language} isn't available yet`);
  }

  let character;
  if (job.characterId) {
    character = await getCharacter(db, userId, job.characterId);
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
    story: job.story,
    style: job.style,
    format: job.format,
    durationSec,
    kidSafe: job.kidSafe,
    quality,
    credits,
  });
  await getFilmQueue().add(
    "film",
    {
      ...job,
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
