import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { deleteFilm, filmView, getFilm } from "@/lib/films";
import { loadEnv } from "@/lib/env";
import { madeWithRecipe, stopRecipeForFilm } from "@/lib/recipes";
import { getUserId, unauthorized } from "@/lib/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const film = await getFilm(getDb(), userId, id).catch(() => undefined);
  if (!film) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // "Recipe by @maker" on Making and the finished reel.
  return NextResponse.json({ ...filmView(film), recipe: await madeWithRecipe(getDb(), film.recipeId) });
}

// ?recipe=stop is "Delete reel and recipe": the recipe shared from it stops too. Otherwise the
// recipe stays (it's a snapshot with its own preview and music).
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const stop = new URL(req.url).searchParams.get("recipe") === "stop" ? await stopRecipeForFilm(getDb(), userId, id) : undefined;
  const result = await deleteFilm(getDb(), userId, id, loadEnv().OUTPUT_DIR);
  if (result === "deleted") await stop?.();
  if (result === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (result === "busy") {
    return NextResponse.json({ error: "This reel is still being made or posted. Try again when it's done." }, { status: 409 });
  }
  return new Response(null, { status: 204 });
}
