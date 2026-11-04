import { NextResponse } from "next/server";
import { loadEnv } from "@/lib/env";
import { MAX_PHOTO_BYTES, savePhoto } from "@/lib/photos";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { getUserId, unauthorized } from "@/lib/session";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Uploads a photo for a Cinematic or AI-animated reel; the reel request then names it by id.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  if (!(await allow(getRedis(), `ratelimit:photo:${userId}`, 50, 24 * 3600))) return bad("You've added a lot of photos today. Try again tomorrow.", 429);
  const form = await req.formData().catch(() => undefined);
  const photo = form?.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return bad("Choose a photo.");
  if (photo.size > MAX_PHOTO_BYTES) return bad("That photo is too large (10 MB max).");
  const id = await savePhoto(loadEnv().OUTPUT_DIR, userId, Buffer.from(await photo.arrayBuffer()));
  if (!id) return bad("Use a JPG, PNG or WebP photo.");
  return NextResponse.json({ photo: id }, { status: 201 });
}
