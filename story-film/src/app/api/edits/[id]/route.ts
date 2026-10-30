import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { applyEditChanges, type EditState, FREE_RERENDERS, loadEditState, saveEditState } from "@/lib/edit/state";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { getFilm, updateFilmIf } from "@/lib/films";
import { editChangesSchema, getFilmQueue } from "@/lib/queue/films";
import { getUserId, unauthorized } from "@/lib/session";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function load(id: string) {
  const userId = await getUserId();
  if (!userId) return { error: unauthorized() };
  const film = await getFilm(getDb(), userId, id).catch(() => undefined);
  if (!film || film.format !== "edit") return { error: bad("Not found", 404) };
  const workDir = path.resolve(loadEnv().OUTPUT_DIR, film.id);
  const state = await loadEditState(workDir).catch(() => undefined);
  return { userId, film, workDir, state };
}

function view(status: string, state: EditState) {
  const { request: r } = state;
  return {
    status,
    durationSec: state.durationSec,
    plan: state.plan,
    words: state.transcript.words,
    options: { captions: r.captions !== false, sounds: r.sounds !== false, voice: r.voice ?? "natural" },
    available: state.available,
    // Before the first render, rendering is part of the upload; afterwards a few re-renders are free.
    rendersLeft: status === "review" ? null : Math.max(0, FREE_RERENDERS - state.renders),
  };
}

// The planned edit: every zoom, card and effect, for the review and fine-tune screens.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error, film, state } = await load((await params).id);
  if (error) return error;
  if (!state) return bad("This video's edit plan isn't ready yet.", 409);
  return NextResponse.json(view(film.status, state));
}

// Saves the creator's changes and renders the video (again).
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error, userId, film, workDir, state } = await load((await params).id);
  if (error) return error;
  if (!state || (film.status !== "review" && film.status !== "completed")) return bad("This video is still being made. Try again when it's ready.", 409);
  const parsed = editChangesSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(z.prettifyError(parsed.error));

  const rerender = film.status === "completed";
  if (rerender && state.renders >= FREE_RERENDERS) return bad(`You've re-rendered this video ${FREE_RERENDERS} times. Upload it again to start over.`, 402);
  const next = applyEditChanges(state, parsed.data);
  // Claim the film first so a second tap can't start two renders.
  if (!(await updateFilmIf(getDb(), film.id, film.status, { status: "queued", stage: null, error: null, title: next.plan.title }))) {
    return bad("This video is already being rendered.", 409);
  }
  await saveEditState(workDir, { ...next, renders: state.renders + (rerender ? 1 : 0) });
  const original = rerender ? undefined : await getFilmQueue().getJob(film.id);
  await getFilmQueue().add(
    "edit-render",
    {
      filmId: film.id,
      userId,
      rerender,
      // The first render after review still carries the upload's charge, so a failure refunds it.
      credits: rerender ? 0 : film.credits,
      quotaKey: rerender ? undefined : (original?.data as { quotaKey?: string } | undefined)?.quotaKey,
    },
    { jobId: `${film.id}-render-${state.renders + (rerender ? 1 : 0)}` },
  );
  return NextResponse.json({ id: film.id, rendersLeft: rerender ? FREE_RERENDERS - state.renders - 1 : FREE_RERENDERS }, { status: 202 });
}
