import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { PREMIUM_CREDITS_PER_SHOT, STANDARD_CREDITS } from "@/lib/billing/catalog";
import { spendCredits } from "@/lib/billing/credits";
import { getCharacter } from "@/lib/characters";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { createFilm, filmView, listFilms } from "@/lib/films";
import { premiumAvailable } from "@/lib/providers";
import { filmJobSchema, getFilmQueue, getRedis } from "@/lib/queue/films";
import { FREE_PLAN, shotCountFor } from "@/lib/quota/plans";
import { RedisQuotaStore, reserveFilm } from "@/lib/quota/quota";
import { getUserId, unauthorized } from "@/lib/session";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  return NextResponse.json({ films: (await listFilms(getDb(), userId)).map(filmView) });
}

const needCredits = (message: string) => NextResponse.json({ error: message, needCredits: true }, { status: 402 });

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = filmJobSchema.safeParse({ ...(await req.json()), userId });
  if (!parsed.success) {
    return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }
  const env = loadEnv();
  const db = getDb();
  const { quality, durationSec } = parsed.data;
  if (quality === "premium" && !premiumAvailable(env)) {
    return NextResponse.json({ error: "AI animation isn't available yet" }, { status: 400 });
  }

  let character;
  if (parsed.data.characterId) {
    character = await getCharacter(db, userId, parsed.data.characterId);
    if (!character) return NextResponse.json({ error: "Character not found" }, { status: 404 });
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
    return needCredits(
      quality === "standard"
        ? `You've used this week's ${plan.filmsPerWeek} free videos. Buy credits to keep creating.`
        : `AI animation needs ${credits} credits for this length.`,
    );
  }

  const film = await createFilm(db, {
    id: filmId,
    userId,
    characterId: character?.id,
    story: parsed.data.story,
    style: parsed.data.style,
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
  return NextResponse.json({ id: film.id, credits }, { status: 202 });
}
