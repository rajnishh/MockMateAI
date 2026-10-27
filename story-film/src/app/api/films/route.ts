import { NextResponse } from "next/server";
import { z } from "zod";
import { getCharacter } from "@/lib/characters";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { createFilm, filmView, listFilms } from "@/lib/films";
import { filmJobSchema, getFilmQueue, getRedis } from "@/lib/queue/films";
import { FREE_PLAN } from "@/lib/quota/plans";
import { RedisQuotaStore, reserveFilm } from "@/lib/quota/quota";
import { getUserId, unauthorized } from "@/lib/session";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  return NextResponse.json({ films: (await listFilms(getDb(), userId)).map(filmView) });
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = filmJobSchema.safeParse({ ...(await req.json()), userId });
  if (!parsed.success) {
    return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }
  const db = getDb();

  let character;
  if (parsed.data.characterId) {
    character = await getCharacter(db, userId, parsed.data.characterId);
    if (!character) return NextResponse.json({ error: "Character not found" }, { status: 404 });
  }

  const plan = { ...FREE_PLAN, filmsPerWeek: loadEnv().FREE_FILMS_PER_WEEK };
  const quota = await reserveFilm(new RedisQuotaStore(getRedis()), userId, parsed.data.durationSec, plan);
  if (!quota.ok) return NextResponse.json({ error: quota.reason }, { status: 429 });

  const film = await createFilm(db, {
    userId,
    characterId: character?.id,
    story: parsed.data.story,
    style: parsed.data.style,
    durationSec: parsed.data.durationSec,
  });
  await getFilmQueue().add(
    "film",
    { ...parsed.data, character, resolution: plan.resolution, watermark: plan.watermark, quotaKey: quota.key },
    { jobId: film.id },
  );
  return NextResponse.json({ id: film.id }, { status: 202 });
}
