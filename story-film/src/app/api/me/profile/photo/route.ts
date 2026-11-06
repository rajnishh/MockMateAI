import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { MAX_PHOTO_BYTES } from "@/lib/photos";
import { myProfile, profilePhotoFile, setProfilePhoto } from "@/lib/profile";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { serveFile } from "@/lib/serve-file";
import { getUserId, unauthorized } from "@/lib/session";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

// The creator's own uploaded profile photo.
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const found = await profilePhotoFile(getDb(), loadEnv().OUTPUT_DIR, userId);
  if (!found) return new Response("Not found", { status: 404 });
  return serveFile(req, found.file, { "Content-Type": found.type, "Cache-Control": "private, max-age=31536000, immutable" });
}

// Uploads a photo and makes it the profile photo (replacing a ready-made avatar or an older photo).
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  if (!(await allow(getRedis(), `ratelimit:profile-photo:${userId}`, 20, 24 * 3600))) return bad("You've changed your photo a lot today. Try again tomorrow.", 429);
  const form = await req.formData().catch(() => undefined);
  const photo = form?.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return bad("Choose a photo.");
  if (photo.size > MAX_PHOTO_BYTES) return bad("That photo is too large (10 MB max).");
  const db = getDb();
  if (!(await setProfilePhoto(db, loadEnv().OUTPUT_DIR, userId, Buffer.from(await photo.arrayBuffer())))) return bad("Use a JPG, PNG or WebP photo.");
  return NextResponse.json(await myProfile(db, userId), { status: 201 });
}
