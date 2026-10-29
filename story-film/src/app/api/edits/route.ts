import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { STANDARD_CREDITS } from "@/lib/billing/catalog";
import { spendCredits } from "@/lib/billing/credits";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { probeDuration } from "@/lib/ffmpeg";
import { createFilm } from "@/lib/films";
import { editsAvailable } from "@/lib/providers";
import { editRequestSchema, getFilmQueue, getRedis } from "@/lib/queue/films";
import { FREE_PLAN } from "@/lib/quota/plans";
import { RedisQuotaStore, reserveFilm } from "@/lib/quota/quota";
import { allow } from "@/lib/rate-limit";
import { getUserId, unauthorized } from "@/lib/session";

const MAX_EDIT_BYTES = 200 * 1024 * 1024;
const MIN_SEC = 3;
const VIDEO_EXT: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/x-matroska": "mkv", "video/3gpp": "3gp" };

const bad = (error: string, status = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });

// "Edit my video": upload a clip you filmed; we add captions, zooms and cards.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const env = loadEnv();
  if (!editsAvailable(env)) return bad("Video editing isn't set up on this server yet", 503);
  if (!(await allow(getRedis(), `ratelimit:edit:${userId}`, 20, 24 * 3600))) return bad("You've edited a lot of videos today. Try again tomorrow.", 429);

  const form = await req.formData();
  const video = form.get("video");
  if (!(video instanceof File) || video.size === 0) return bad("Choose a video to edit.");
  if (video.size > MAX_EDIT_BYTES) return bad("That video is too large (200 MB max). Trim it or export at 1080p.");
  const ext = VIDEO_EXT[video.type] ?? (video.name.split(".").pop()?.toLowerCase() || "mp4");
  if (!Object.values(VIDEO_EXT).includes(ext)) return bad("Upload an MP4, MOV or WebM video.");

  const flag = (name: string) => form.get(name) !== "false";
  let brand: unknown;
  try {
    brand = form.get("brand") ? JSON.parse(String(form.get("brand"))) : undefined;
  } catch {
    return bad("Brand settings are not valid.");
  }
  const parsed = editRequestSchema.safeParse({
    language: form.get("language") ?? undefined,
    captions: flag("captions"),
    zooms: flag("zooms"),
    ending: form.get("ending") ?? undefined,
    keyword: form.get("keyword") || undefined,
    brand,
  });
  if (!parsed.success) return bad(z.prettifyError(parsed.error));

  const filmId = randomUUID();
  const dir = path.resolve(env.OUTPUT_DIR, "uploads");
  await mkdir(dir, { recursive: true });
  const source = path.join(dir, `${filmId}.${ext}`);
  await writeFile(source, Buffer.from(await video.arrayBuffer()));

  const fail = async (message: string, status = 400, extra: Record<string, unknown> = {}) => {
    await rm(source, { force: true });
    return bad(message, status, extra);
  };
  const durationSec = await probeDuration(source).catch(() => NaN);
  if (!Number.isFinite(durationSec)) return fail("We couldn't read that video. Try exporting it again as MP4.");
  if (durationSec < MIN_SEC) return fail("That video is too short (3 seconds minimum).");
  if (durationSec > FREE_PLAN.maxDurationSec + 0.5) return fail(`Videos can be up to ${FREE_PLAN.maxDurationSec} seconds for now. Trim it and try again.`);

  // Edits use the free weekly allowance like standard reels, then 1 credit.
  const db = getDb();
  const plan = { ...FREE_PLAN, filmsPerWeek: env.FREE_FILMS_PER_WEEK };
  let quotaKey: string | undefined;
  let credits = 0;
  const quota = await reserveFilm(new RedisQuotaStore(getRedis()), userId, Math.min(durationSec, plan.maxDurationSec), plan);
  if (quota.ok) quotaKey = quota.key;
  else credits = STANDARD_CREDITS;
  if (credits > 0 && !(await spendCredits(db, userId, credits, filmId))) {
    return fail(`You've used this week's ${plan.filmsPerWeek} free videos. Buy credits to keep creating.`, 402, { needCredits: true });
  }

  await createFilm(db, {
    id: filmId,
    userId,
    story: `Edit of ${video.name}`.slice(0, 200),
    style: "animated",
    format: "edit",
    durationSec: Math.ceil(durationSec),
    quality: "standard",
    credits,
  });
  await getFilmQueue().add(
    "edit",
    { ...parsed.data, userId, source, watermark: credits === 0, quotaKey, credits },
    { jobId: filmId },
  );
  return NextResponse.json({ id: filmId, credits }, { status: 202 });
}
