import { randomUUID } from "node:crypto";
import { CINEMATIC_CREDITS_PER_SHOT, DANCE_SONG_CREDITS, PREMIUM_CREDITS_PER_SHOT, STANDARD_CREDITS } from "@/lib/billing/catalog";
import { spendCredits } from "@/lib/billing/credits";
import { getCharacter } from "@/lib/characters";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { createFilm } from "@/lib/films";
import { findLanguage, normaliseLanguage } from "@/lib/languages";
import { photoUrl } from "@/lib/photos";
import { buildTts, cinematicAvailable, danceSongAvailable, premiumAvailable } from "@/lib/providers";
import { type FilmJob, filmJobSchema, getFilmQueue, getRedis } from "@/lib/queue/films";
import { FREE_PLAN, isoWeekKey, shotCountFor } from "@/lib/quota/plans";
import { RedisQuotaStore, reserveFilm } from "@/lib/quota/quota";
import { applyRecipe, RecipeLockError, recipeJob } from "@/lib/recipe-spec";
import { type Recipe, RecipeGoneError, recipeForUse, recipeSpecOf, recipeStarted } from "@/lib/recipes";
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
  referenceImageUrls: "Add up to 4 pictures, as https links.",
  photo: "Upload your photo again.",
  quality: "Pick Standard, AI animation or Cinematic.",
  brand: "Your Brand kit settings aren't valid. Open Brand kit and save them again.",
  script: "The script isn't valid: check each shot has narration, a picture and a motion description.",
  danceScript: "The dance script isn't valid: check the title, dancers and chant lines.",
  motionScript: "The slides aren't valid: check each slide's type, its fields and its narration.",
  danceVoice: "Pick how the chant is voiced: sung, chant or AI song.",
};

// Checks a request from any app or assistant. Callers may leave out the style or send a language
// as "hi-IN" or "Hindi": the style falls back to the default (motion and dance reels are drawn by
// Reelkar and don't use one) and the language to its code, or "auto" when it isn't one Reelkar knows.
export function parseFilmRequest(userId: string, body: unknown) {
  const input = { ...(body && typeof body === "object" ? body : {}) } as Record<string, unknown>;
  const drawn = input.format === "motion" || input.format === "dance";
  const noStyle = input.style === undefined || input.style === null || input.style === "";
  input.style = drawn || noStyle ? DEFAULT_STYLE : (findStyle(input.style) ?? input.style);
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
  const env = loadEnv();
  const db = getDb();
  // "Use this recipe": the recipe's locked values over the user's own, checked before charging.
  const used = await recipeOf(db, body);
  const job = parseFilmRequest(userId, used ? lockToRecipe(body as Record<string, unknown>, used) : body);
  // Motion and dance reels use no image or video models, so they are always priced as standard videos.
  if (job.format === "motion" || job.format === "dance") {
    job.quality = "standard";
    job.photo = undefined;
  }
  const { quality, durationSec } = job;
  if (quality === "premium" && !premiumAvailable(env)) throw new StartError("AI animation isn't available yet");
  if (quality === "cinematic" && !cinematicAvailable(env)) throw new StartError("Cinematic videos aren't available yet");

  const photoFile = await resolvePhoto(job, env.OUTPUT_DIR);
  // An AI-sung dance reel is a paid song; the free sung and spoken chants are standard reels.
  const aiSong = job.format === "dance" && job.danceVoice === "ai_song";
  if (aiSong && !danceSongAvailable(env)) throw new StartError("AI singing isn't available yet");

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

  // Standard videos use the free weekly allowance first, then 1 credit; paid ones always cost credits.
  const filmId = randomUUID();
  const plan = { ...FREE_PLAN, filmsPerWeek: env.FREE_FILMS_PER_WEEK };
  let quotaKey: string | undefined;
  const paid = paidCredits(job, env.CINEMATIC_VIDEO_MODEL);
  let credits = paid ?? 0;
  if (paid === undefined) {
    const quota = await reserveFilm(new RedisQuotaStore(getRedis()), userId, durationSec, plan);
    if (quota.ok) quotaKey = quota.key;
    else credits = STANDARD_CREDITS;
  }
  if (credits > 0 && !(await spendCredits(db, userId, credits, filmId))) {
    throw new StartError(
      aiSong
        ? `AI singing needs ${credits} credits.`
        : quality === "standard"
        ? `You've used this week's ${plan.filmsPerWeek} free videos. Buy credits to keep creating.`
        : `${quality === "cinematic" ? "A Cinematic video" : "AI animation"} needs ${credits} credits for this length.`,
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
    photoConsentAt: photoFile ? new Date() : undefined,
  });
  // The maker's share of it is pending until the reel finishes (never from your own or a free reel).
  if (used) await recipeStarted(db, used, { filmId, userId, credits });
  await getFilmQueue().add(
    "film",
    {
      ...job,
      character,
      photoUrl: photoFile,
      // Paid videos have no watermark beyond the AI label.
      resolution: quality === "cinematic" ? "1080p" : plan.resolution,
      watermark: credits === 0 && job.reelkarMark,
      aiLabel: job.aiLabel,
      quotaKey,
      credits,
      ...(used ? { recipe: recipeJob(recipeSpecOf(used), used.musicPath) } : {}),
    },
    { jobId: film.id },
  );
  return { id: film.id, credits };
}

// The recipe a request names (`recipe`: its public id), or null; 404 unknown, 410 no longer shared.
export async function recipeOf(db: ReturnType<typeof getDb>, body: unknown): Promise<Recipe | null> {
  const id = body && typeof body === "object" ? (body as { recipe?: unknown }).recipe : undefined;
  if (id === undefined || id === null || id === "") return null;
  try {
    return await recipeForUse(db, id);
  } catch (err) {
    if (err instanceof RecipeGoneError) throw new StartError(err.message, err.status);
    throw err;
  }
}

// The request with the recipe's locked fields; a request that changes one is refused.
export function lockToRecipe(body: Record<string, unknown>, r: Recipe): Record<string, unknown> {
  const spec = recipeSpecOf(r);
  if (spec.format === "edit") throw new StartError("This recipe edits your own video. Open it from Edit my video.");
  try {
    return applyRecipe(body, spec);
  } catch (err) {
    if (err instanceof RecipeLockError) throw new StartError(err.message);
    throw err;
  }
}

// The uploaded photo's file, checked before charging. A photo needs the paid image model, which keeps
// the person's face, and the creator's word that the person in it agreed.
export async function resolvePhoto(job: Pick<FilmJob, "userId" | "photo" | "photoConsent" | "quality">, outputDir: string): Promise<string | undefined> {
  if (!job.photo) return undefined;
  if (job.quality === "standard") throw new StartError("A photo needs AI animation or Cinematic quality.");
  if (!job.photoConsent) throw new StartError("Confirm the photo is of you, or of someone who agreed to be in this video.");
  const file = await photoUrl(outputDir, job.userId, job.photo);
  if (!file) throw new StartError("Upload your photo again.", 404);
  return file;
}

// What a paid reel costs: AI animation and Cinematic per shot, an AI-sung dance reel a song's price.
// Undefined for standard reels, which use the free weekly allowance first and then cost STANDARD_CREDITS.
export function paidCredits(
  job: Pick<FilmJob, "format" | "quality" | "durationSec" | "danceVoice">,
  cinematicModel: keyof typeof CINEMATIC_CREDITS_PER_SHOT = "kling",
): number | undefined {
  if (job.format === "dance" && job.danceVoice === "ai_song") return DANCE_SONG_CREDITS;
  if (job.quality === "premium") return shotCountFor(job.durationSec) * PREMIUM_CREDITS_PER_SHOT;
  if (job.quality === "cinematic") return shotCountFor(job.durationSec) * CINEMATIC_CREDITS_PER_SHOT[cinematicModel];
  return undefined;
}

// Free standard reels left this week.
export async function freeReelsLeft(userId: string, now = new Date()): Promise<number> {
  const used = Number((await getRedis().get(`quota:films:${userId}:${isoWeekKey(now)}`)) ?? 0);
  return Math.max(0, loadEnv().FREE_FILMS_PER_WEEK - used);
}
