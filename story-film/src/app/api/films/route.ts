import { NextResponse } from "next/server";
import { z } from "zod";
import { CharacterStore } from "@/lib/characters";
import { loadEnv } from "@/lib/env";
import { filmJobSchema, getFilmQueue, getRedis } from "@/lib/queue/films";
import { FREE_PLAN } from "@/lib/quota/plans";
import { RedisQuotaStore, reserveFilm } from "@/lib/quota/quota";
import { getUserId } from "@/lib/session";

export async function POST(req: Request) {
  const userId = (await getUserId(true))!;
  const parsed = filmJobSchema.safeParse({ ...(await req.json()), userId });
  if (!parsed.success) {
    return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }

  let character;
  if (parsed.data.characterId) {
    character = await new CharacterStore(getRedis()).get(userId, parsed.data.characterId);
    if (!character) return NextResponse.json({ error: "Character not found" }, { status: 404 });
  }

  const plan = { ...FREE_PLAN, filmsPerWeek: loadEnv().FREE_FILMS_PER_WEEK };
  const quota = await reserveFilm(new RedisQuotaStore(getRedis()), userId, parsed.data.durationSec, plan);
  if (!quota.ok) return NextResponse.json({ error: quota.reason }, { status: 429 });

  const job = await getFilmQueue().add("film", {
    ...parsed.data,
    character,
    resolution: plan.resolution,
    watermark: plan.watermark,
    quotaKey: quota.key,
  });
  return NextResponse.json({ id: job.id }, { status: 202 });
}
