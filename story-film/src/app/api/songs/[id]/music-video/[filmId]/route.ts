import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { musicVideoKindCredits, STORYBOARD_REDRAWS } from "@/lib/billing/catalog";
import { grantCredits, spendCredits } from "@/lib/billing/credits";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { getFilm, updateFilmIf } from "@/lib/films";
import { drawFrame, loadStoryboard, saveStoryboard } from "@/lib/music-video/pipeline";
import { applyStoryboardChanges, REQUEST_FILE, storyboardChangesSchema, storyboardView } from "@/lib/music-video/request";
import { buildImage } from "@/lib/providers";
import { getFilmQueue, type MusicVideoJob } from "@/lib/queue/films";
import { getUserId, unauthorized } from "@/lib/session";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
type Params = { params: Promise<{ id: string; filmId: string }> };

async function load(params: Params["params"]) {
  const userId = await getUserId();
  if (!userId) return { error: unauthorized() };
  const { id, filmId } = await params;
  const film = await getFilm(getDb(), userId, filmId).catch(() => undefined);
  if (!film || film.songId !== id) return { error: bad("Not found", 404) };
  const workDir = path.resolve(loadEnv().OUTPUT_DIR, film.id);
  const board = await loadStoryboard(workDir).catch(() => undefined);
  return { userId, film, workDir, board, base: `/api/songs/${id}/music-video/${filmId}` };
}

// The storyboard to check (once the film is in "review"), and the video once it's made.
export async function GET(_req: Request, { params }: Params) {
  const r = await load(params);
  if (r.error) return r.error;
  const { film, board, base } = r;
  return NextResponse.json({
    id: film.id,
    status: film.status,
    stage: film.stage,
    error: film.error,
    videoUrl: film.status === "completed" ? `/api/films/${film.id}/video` : null,
    storyboard: board ? storyboardView(board, base) : null,
  });
}

// Changes shots (type and picture words) and redraws their pictures, free up to a limit.
export async function PUT(req: Request, { params }: Params) {
  const r = await load(params);
  if (r.error) return r.error;
  const { film, board, workDir, base } = r;
  if (film.status !== "review" || !board) return bad("This storyboard can't be changed any more.", 409);
  const parsed = storyboardChangesSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(z.prettifyError(parsed.error));
  const redraw = applyStoryboardChanges(board, parsed.data);
  if (typeof redraw === "string") return bad(redraw);
  const env = loadEnv();
  const image = buildImage(env, board.kind === "lyric" ? "standard" : "premium");
  // Over the limit, a changed shot is drawn when the video is made instead.
  const now = redraw.slice(0, Math.max(0, STORYBOARD_REDRAWS - board.redraws));
  for (const i of redraw) if (!now.includes(i)) board.shots[i].frame = undefined;
  const drawn = await Promise.all(now.map((i) => drawFrame(image, board, i, workDir).catch(() => null)));
  now.forEach((i, j) => {
    board.shots[i].frame = drawn[j] ?? undefined;
    if (drawn[j]) board.redraws++;
  });
  await saveStoryboard(workDir, board);
  return NextResponse.json({ storyboard: storyboardView(board, base), blocked: now.filter((_, j) => !drawn[j]).length });
}

// Pays for the storyboard and makes the video. Refunded if it fails, as for every video.
export async function POST(_req: Request, { params }: Params) {
  const r = await load(params);
  if (r.error) return r.error;
  const { userId, film, board, workDir } = r;
  if (film.status !== "review" || !board) return bad("This video is already being made.", 409);
  const request = JSON.parse(await readFile(path.join(workDir, REQUEST_FILE), "utf8")) as MusicVideoJob;
  const db = getDb();
  const credits = musicVideoKindCredits(board.kind, board.duration);
  const ref = `${film.id}-render`;
  if (!(await spendCredits(db, userId, credits, ref))) {
    return NextResponse.json({ error: `This music video needs ${credits} credits.`, needCredits: true }, { status: 402 });
  }
  // Only one render, even if the button is pressed twice.
  if (!(await updateFilmIf(db, film.id, "review", { status: "queued", credits, stage: null }))) {
    await grantCredits(db, userId, credits, "refund", ref);
    return bad("This video is already being made.", 409);
  }
  try {
    await getFilmQueue().add("music-video", { ...request, phase: "render", filmId: film.id, credits }, { jobId: ref });
  } catch (err) {
    await grantCredits(db, userId, credits, "refund", ref);
    await updateFilmIf(db, film.id, "queued", { status: "review", credits: 0 });
    throw err;
  }
  return NextResponse.json({ id: film.id, credits }, { status: 202 });
}
