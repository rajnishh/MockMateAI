import path from "node:path";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { getFilm, updateFilmIf } from "@/lib/films";
import { getFilmQueue } from "@/lib/queue/films";
import { applyEditChanges, type EditChanges, FREE_RERENDERS, loadEditState, saveEditState } from "./state";

// Why an edit couldn't be rendered (again).
export class RenderError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

// Saves the creator's changes to a planned or finished edit and queues the render. Shared by the
// moments screens and the Ask Reelkar agent. Changes left out keep their current value.
export async function rerenderEdit(userId: string, filmId: string, changes: Partial<EditChanges>): Promise<{ id: string; rendersLeft: number }> {
  const film = await getFilm(getDb(), userId, filmId).catch(() => undefined);
  if (!film || film.format !== "edit") throw new RenderError("Not found", 404);
  const workDir = path.resolve(loadEnv().OUTPUT_DIR, film.id);
  const state = await loadEditState(workDir).catch(() => undefined);
  if (!state || (film.status !== "review" && film.status !== "completed")) throw new RenderError("This video is still being made. Try again when it's ready.", 409);

  const rerender = film.status === "completed";
  if (rerender && state.renders >= FREE_RERENDERS) throw new RenderError(`You've re-rendered this video ${FREE_RERENDERS} times. Upload it again to start over.`, 402);
  const next = applyEditChanges(state, { plan: state.plan, ...changes });
  // Claim the film first so a second tap can't start two renders.
  if (!(await updateFilmIf(getDb(), film.id, film.status, { status: "queued", stage: null, error: null, title: next.plan.title }))) {
    throw new RenderError("This video is already being rendered.", 409);
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
  return { id: film.id, rendersLeft: rerender ? FREE_RERENDERS - state.renders - 1 : FREE_RERENDERS };
}
