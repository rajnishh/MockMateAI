import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { loadEnv } from "@/lib/env";
import { probeDuration } from "@/lib/ffmpeg";
import { MAX_DANCE_CLIP_BYTES, uploadedClipPath } from "@/lib/music-video/dance";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { getUserId, unauthorized } from "@/lib/session";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

// A clip of the creator dancing; the full music video copies its moves onto the star. Only
// with the creator's consent: it must be them, or someone who agreed to have their moves copied.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  if (!(await allow(getRedis(), `ratelimit:dance-clip:${userId}`, 20, 24 * 3600))) return bad("You've added a lot of dance clips today. Try again tomorrow.", 429);
  const form = await req.formData().catch(() => undefined);
  const clip = form?.get("clip");
  if (form?.get("consent") !== "true") return bad("Confirm the clip is of you, or of someone who agreed to have their moves copied.");
  if (!(clip instanceof File) || clip.size === 0) return bad("Choose a video of you dancing.");
  if (clip.size > MAX_DANCE_CLIP_BYTES) return bad("That video is too large (40 MB max). Trim it to 10 seconds.");
  if (!/^video\/(mp4|quicktime)$/.test(clip.type)) return bad("Use an MP4 or MOV video.");
  const id = randomUUID();
  const file = uploadedClipPath(loadEnv().OUTPUT_DIR, userId, id);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(await clip.arrayBuffer()));
  const seconds = await probeDuration(file).catch(() => 0);
  if (seconds < 3) {
    await rm(file, { force: true });
    return bad("Use a video of at least 3 seconds, with your whole body in view.");
  }
  return NextResponse.json({ danceClip: id, seconds: Math.round(seconds) }, { status: 201 });
}
