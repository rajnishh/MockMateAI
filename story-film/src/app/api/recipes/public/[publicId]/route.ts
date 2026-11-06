import { NextResponse } from "next/server";
import { STANDARD_CREDITS } from "@/lib/billing/catalog";
import { paidRatioBp } from "@/lib/billing/earnings";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { cinematicAvailable, premiumAvailable } from "@/lib/providers";
import { isBlocked } from "@/lib/moderation";
import { listRecipes, makerEarns, publicRecipe, publicRecipeView, recipeStats } from "@/lib/recipes";
import { getUserId } from "@/lib/session";
import { freeReelsLeft, paidCredits } from "@/lib/start-film";

// A public recipe (C4, M5, and Create with a recipe), with its rails. Signed in, it adds the price
// for the recipe's quality, the viewer's free reels, and what the maker earns from this use; the
// maker gets their own numbers instead. Stopped or removed recipes answer with just their state.
export async function GET(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const lang = new URL(req.url).searchParams.get("lang") ?? "en";
  const db = getDb();
  const found = await publicRecipe(db, publicId);
  if (!found) return NextResponse.json({ error: "We couldn't find this recipe." }, { status: 404 });
  const viewerId = await getUserId().catch(() => undefined);
  const view = publicRecipeView(found, viewerId, lang);
  if (!view.recipe) {
    return NextResponse.json({ state: view.state, error: view.state === "taken_down" ? "This recipe was removed after a report." : "This recipe isn't shared any more." }, { status: 410 });
  }
  const r = found.recipe;
  const occasion = r.occasions[0];
  const [sameFestival, byMaker] = await Promise.all([
    occasion ? listRecipes(db, { viewerId, collection: occasion, exclude: publicId, limit: 6 }) : Promise.resolve([]),
    listRecipes(db, { viewerId, makerHandle: found.handle, exclude: publicId, limit: 6 }),
  ]);
  const rails = { sameFestival, byMaker, occasion: occasion ?? null };
  if (!viewerId) return NextResponse.json({ ...view, rails });
  if (view.mine) return NextResponse.json({ ...view, rails, stats: await recipeStats(db, r) });
  const env = loadEnv();
  const creatorBlocked = await isBlocked(db, viewerId, r.makerId);
  const freeLeft = await freeReelsLeft(viewerId).catch(() => null);
  const credits = paidCredits({ format: r.format === "edit" ? "story" : r.format, quality: r.quality, durationSec: r.durationSec, danceVoice: (r.spec as { voice?: "sung" | "chant" | "ai_song" }).voice ?? "sung" }, env.CINEMATIC_VIDEO_MODEL) ?? (freeLeft === 0 ? STANDARD_CREDITS : 0);
  const ratio = await paidRatioBp(db, viewerId);
  return NextResponse.json({
    ...view,
    rails,
    creatorBlocked,
    price: { quality: r.quality, credits, freeLeft, standardCredits: STANDARD_CREDITS, premiumAvailable: premiumAvailable(env), cinematicAvailable: cinematicAvailable(env) },
    paidRatioBp: ratio,
    makerEarns: makerEarns(credits, ratio, false),
  });
}
