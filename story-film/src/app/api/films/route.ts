import { NextResponse } from "next/server";
import { z } from "zod";
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

  const quota = await reserveFilm(new RedisQuotaStore(getRedis()), userId, parsed.data.durationSec, FREE_PLAN);
  if (!quota.ok) return NextResponse.json({ error: quota.reason }, { status: 429 });

  const job = await getFilmQueue().add("film", {
    ...parsed.data,
    resolution: FREE_PLAN.resolution,
    watermark: FREE_PLAN.watermark,
    quotaKey: quota.key,
  });
  return NextResponse.json({ id: job.id }, { status: 202 });
}
