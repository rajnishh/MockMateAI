import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { getFilm } from "@/lib/films";
import { readFilmScript, writePostCopy } from "@/lib/post-copy";
import { buildLlm } from "@/lib/providers";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { getUserId, unauthorized } from "@/lib/session";

const schema = z.object({ platform: z.enum(["youtube", "instagram", "whatsapp"]) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "platform must be youtube, instagram or whatsapp" }, { status: 400 });
  const { id } = await params;
  const film = await getFilm(getDb(), userId, id).catch(() => undefined);
  if (!film || film.status !== "completed") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await allow(getRedis(), `ratelimit:copy:${userId}`, 60, 24 * 3600))) {
    return NextResponse.json({ error: "Daily limit for AI captions reached. Try again tomorrow." }, { status: 429 });
  }

  const script = await readFilmScript(film.outputPath);
  try {
    const copy = await writePostCopy(buildLlm(loadEnv()), parsed.data.platform, {
      story: film.story,
      title: film.title,
      narration: script?.shots.map((s) => s.narration),
      language: script?.language,
      kidSafe: film.kidSafe,
    });
    return NextResponse.json(copy);
  } catch (err) {
    return NextResponse.json({ error: `Couldn't write a caption: ${(err as Error).message}` }, { status: 502 });
  }
}
