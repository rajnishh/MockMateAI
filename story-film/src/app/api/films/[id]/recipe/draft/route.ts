import path from "node:path";
import { NextResponse } from "next/server";
import { llmForUser } from "@/lib/ai/engines";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { getFilm } from "@/lib/films";
import { getProfile } from "@/lib/listen";
import { BLOCK_TEXT, draftRecipe, goodFor, recipeBlock, recipeHas } from "@/lib/recipes";
import { ShapeError } from "@/lib/recipe-spec";
import { getUserId, unauthorized } from "@/lib/session";

// The Share as a recipe sheet (M3): what people get, the shape, a name, the festivals coming up and
// whether the preview needs the maker's say-so. The shape is written once per reel (?lang= is the
// app language for its display text).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const lang = new URL(req.url).searchParams.get("lang") ?? "en";
  const db = getDb();
  const env = loadEnv();
  const f = await getFilm(db, userId, id).catch(() => undefined);
  if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const block = recipeBlock(f);
  if (block) return NextResponse.json({ eligible: false, reason: block, error: BLOCK_TEXT[block] });
  try {
    const draft = await draftRecipe(await llmForUser(db, env, userId), f, path.resolve(env.OUTPUT_DIR, f.id), lang);
    return NextResponse.json({
      eligible: true,
      spec: draft.spec,
      has: recipeHas(draft.spec, lang),
      topicHint: draft.topicHint,
      needsPreviewConsent: draft.needsPreviewConsent,
      suggestedName: draft.suggestedName,
      festivals: goodFor(lang),
      handle: (await getProfile(db, userId))?.handle ?? null,
    });
  } catch (err) {
    if (!(err instanceof ShapeError)) console.error("recipe draft failed", err);
    const stuck = err instanceof ShapeError && /yet/.test(err.message);
    return NextResponse.json({ eligible: !stuck, reason: stuck ? "cantRead" : undefined, error: stuck ? BLOCK_TEXT.cantRead : "Couldn't read this reel's script. Try again." }, { status: stuck ? 200 : 422 });
  }
}
