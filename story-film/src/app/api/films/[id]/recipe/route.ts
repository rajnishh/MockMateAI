import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { llmForUser } from "@/lib/ai/engines";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { getFilm } from "@/lib/films";
import { draftRecipe, ffmpegRecipeFiles, filmRecipeInfo, publishRecipe, recipeUrl, shareSchema } from "@/lib/recipes";
import { ShapeError } from "@/lib/recipe-spec";
import { getUserId, unauthorized } from "@/lib/session";
import { assertNoRealArtists, SongSafetyError } from "@/lib/songs/safety";

// The finished reel's recipe card (M1): the recipe shared from it, or the one it was made with.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const db = getDb();
  const f = await getFilm(db, userId, id).catch(() => undefined);
  if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await filmRecipeInfo(db, f, loadEnv().BETTER_AUTH_URL));
}

// Share as a recipe. The text safety check runs on the name and the shape; if it fails or can't
// run, nothing is shared (fail closed, like Listen publish).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const parsed = shareSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const db = getDb();
  const env = loadEnv();
  const f = await getFilm(db, userId, id).catch(() => undefined);
  if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const llm = await llmForUser(db, env, userId);
    const draft = await draftRecipe(llm, f, path.resolve(env.OUTPUT_DIR, f.id));
    const r = await publishRecipe(db, { userId, film: f, draft, input: parsed.data, outputDir: env.OUTPUT_DIR, check: (texts) => assertNoRealArtists(llm, texts), files: ffmpegRecipeFiles() });
    if ("error" in r) return NextResponse.json(r, { status: r.status });
    return NextResponse.json({ publicId: r.recipe.publicId, url: recipeUrl(env.BETTER_AUTH_URL, r.recipe.publicId) }, { status: 201 });
  } catch (err) {
    if (err instanceof ShapeError) return NextResponse.json({ error: "Couldn't read this reel's script. Try again." }, { status: 422 });
    if (err instanceof SongSafetyError) return NextResponse.json({ error: "We can't share this recipe: it names a real person or artist. Change it and try again." }, { status: 400 });
    console.error("recipe share failed", err);
    return NextResponse.json({ error: "We couldn't check your recipe right now, so it wasn't shared. Try again in a minute." }, { status: 502 });
  }
}
