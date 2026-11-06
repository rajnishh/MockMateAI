import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { recipe } from "@/lib/db/schema";
import { deleteFilm, getFilm, type Film } from "@/lib/films";
import { loadEnv } from "@/lib/env";
import { getFilmQueue } from "@/lib/queue/films";
import { StartError, startFilm } from "@/lib/start-film";

// Filled in by startFilm when the reel starts, so a retry must not send them back.
const DERIVED = ["userId", "character", "photoUrl", "resolution", "watermark", "quotaKey", "credits", "recipe"];

// The request a failed reel was started with: its queued job (BullMQ keeps failed jobs), else the
// fields saved on the reel. A recipe reel names its recipe again, so the recipe's rules still apply.
export function retryRequest(row: Pick<Film, "story" | "style" | "format" | "durationSec" | "kidSafe" | "quality" | "characterId">, jobData: Record<string, unknown> | undefined, recipePublicId?: string) {
  const body: Record<string, unknown> = jobData
    ? Object.fromEntries(Object.entries(jobData).filter(([k]) => !DERIVED.includes(k)))
    : { story: row.story, style: row.style, format: row.format, durationSec: row.durationSec, kidSafe: row.kidSafe, quality: row.quality, ...(row.characterId ? { characterId: row.characterId } : {}) };
  if (recipePublicId) body.recipe = recipePublicId;
  return body;
}

// "Try again" on a failed reel: starts it again with the same request, charged like a new reel (the
// failure already gave back the free reel or credits), then removes the failed one.
export async function retryFilm(userId: string, id: string): Promise<{ id: string; credits: number }> {
  const db = getDb();
  const row = await getFilm(db, userId, id).catch(() => undefined);
  if (!row) throw new StartError("Not found", 404);
  if (row.status !== "failed") throw new StartError("Only a reel that failed can be tried again.", 409);
  // Edits and music videos start from their own screens, with the video or song they need.
  if (row.format === "edit" || row.songId) throw new StartError("Make this one again from where you started it.");
  const job = await getFilmQueue().getJob(id);
  const [r] = row.recipeId ? await db.select({ publicId: recipe.publicId }).from(recipe).where(eq(recipe.id, row.recipeId)) : [];
  const started = await startFilm(userId, retryRequest(row, job?.data as Record<string, unknown> | undefined, r?.publicId));
  await deleteFilm(db, userId, id, loadEnv().OUTPUT_DIR).catch(() => undefined);
  return started;
}
