import { access } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { PREVIEW_FILE } from "@/lib/edit/preview";
import { loadVision, sampleFaces } from "@/lib/edit/vision";
import { RenderError, rerenderEdit } from "@/lib/edit/rerender";
import { type EditState, FREE_RERENDERS, loadEditState } from "@/lib/edit/state";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { getFilm } from "@/lib/films";
import { editChangesSchema } from "@/lib/queue/films";
import { getUserId, unauthorized } from "@/lib/session";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function load(id: string) {
  const userId = await getUserId();
  if (!userId) return { error: unauthorized() };
  const film = await getFilm(getDb(), userId, id).catch(() => undefined);
  if (!film || film.format !== "edit") return { error: bad("Not found", 404) };
  const workDir = path.resolve(loadEnv().OUTPUT_DIR, film.id);
  const state = await loadEditState(workDir).catch(() => undefined);
  return { film, workDir, state };
}

async function view(status: string, state: EditState, workDir: string) {
  const { request: r } = state;
  const vision = await loadVision(path.join(workDir, "vision"));
  const preview = await access(path.join(workDir, PREVIEW_FILE)).then(
    () => true,
    () => false,
  );
  return {
    status,
    durationSec: state.durationSec,
    plan: state.plan,
    words: state.transcript.words,
    options: { captions: r.captions !== false, sounds: r.sounds !== false, voice: r.voice ?? "natural" },
    available: state.available,
    // Before the first render, rendering is part of the upload; afterwards a few re-renders are free.
    rendersLeft: status === "review" ? null : Math.max(0, FREE_RERENDERS - state.renders),
    // For the preview: the clip in the final 9:16 crop, and where the face is (10 boxes a second).
    previewUrl: preview ? `/api/edits/${encodeURIComponent(path.basename(workDir))}/preview` : null,
    faces: vision ? { rate: 10, boxes: sampleFaces(vision.faces, vision.fps, 10) } : null,
  };
}

// The planned edit: every zoom, card and effect, for the review and fine-tune screens.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error, film, state, workDir } = await load((await params).id);
  if (error) return error;
  if (!state) return bad("This video's edit plan isn't ready yet.", 409);
  return NextResponse.json(await view(film.status, state, workDir));
}

// Saves the creator's changes and renders the video (again).
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = editChangesSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(z.prettifyError(parsed.error));
  try {
    return NextResponse.json(await rerenderEdit(userId, (await params).id, parsed.data), { status: 202 });
  } catch (err) {
    if (err instanceof RenderError) return bad(err.message, err.status);
    throw err;
  }
}
