import { fileURLToPath } from "node:url";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { insertGift, newGiftSchema, ownGiftView } from "@/lib/gifts";
import { photoUrl } from "@/lib/photos";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { getUserId, unauthorized } from "@/lib/session";
import { getSong } from "@/lib/songs/songs";

// "Make it a gift": a link to this song for one person, with an occasion, a note and a cover. Free.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const db = getDb();
  const song = await getSong(db, userId, id).catch(() => undefined);
  if (!song) return NextResponse.json({ error: "Song not found" }, { status: 404 });
  if (song.status === "failed") return NextResponse.json({ error: "This song wasn't made, so it can't be a gift." }, { status: 400 });
  const parsed = newGiftSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  if (!(await allow(getRedis(), `ratelimit:gift:${userId}`, 100, 24 * 3600))) {
    return NextResponse.json({ error: "You've made a lot of gifts today. Try again tomorrow." }, { status: 429 });
  }
  const env = loadEnv();
  let coverPath: string | null = null;
  if (parsed.data.photo) {
    // Only a photo this person uploaded; the path is resolved here, never taken from the request.
    const url = await photoUrl(env.OUTPUT_DIR, userId, parsed.data.photo);
    if (!url) return NextResponse.json({ error: "That photo wasn't found. Choose it again." }, { status: 400 });
    coverPath = fileURLToPath(url);
  }
  const row = await insertGift(db, {
    songId: song.id,
    senderId: userId,
    toName: parsed.data.toName,
    fromName: parsed.data.fromName,
    occasion: parsed.data.occasion,
    note: parsed.data.note,
    coverPath,
    address: parsed.data.address ?? null,
  });
  return NextResponse.json(ownGiftView(env.BETTER_AUTH_URL, row, song.title, song.status), { status: 201 });
}
