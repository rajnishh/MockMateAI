import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { pickLang } from "@/app/g/[token]/copy";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { findFestival } from "@/lib/festivals";
import { listRecipes, publicRecipe, publicRecipeView, recipeState, recipeUrl } from "@/lib/recipes";
import { getUserId } from "@/lib/session";
import { paidCredits } from "@/lib/start-film";
import { recipePreviewText } from "./copy";
import { RecipePage } from "./recipe-page";

// A shared reel recipe's link page: opens with no sign-in, like the gift and song pages. Its link
// preview (title, text and opengraph-image) is what WhatsApp shows.
export async function generateMetadata({ params }: { params: Promise<{ publicId: string }> }): Promise<Metadata> {
  const { publicId } = await params;
  const found = await publicRecipe(getDb(), publicId);
  if (!found || recipeState(found.recipe) !== "public") return { title: "Reelkar" };
  const base = loadEnv().BETTER_AUTH_URL;
  const { title, description } = recipePreviewText(found.recipe.name, found.handle);
  return {
    metadataBase: new URL(base),
    title,
    description,
    openGraph: { title, description, siteName: "Reelkar", type: "website", url: recipeUrl(base, publicId) },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function Page({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const db = getDb();
  const found = await publicRecipe(db, publicId);
  if (!found) notFound();
  const lang = pickLang((await headers()).get("accept-language"));
  const viewerId = await getUserId().catch(() => undefined);
  const view = publicRecipeView(found, viewerId, lang);
  const occasion = found.recipe.occasions[0];
  const more = view.recipe && occasion ? await listRecipes(db, { collection: occasion, exclude: publicId, limit: 6 }) : [];
  const festival = occasion ? (findFestival(occasion)?.name[lang] ?? null) : null;
  // In general terms: signed out we don't know their credits or free reels.
  const env = loadEnv();
  const r = found.recipe;
  const credits = paidCredits({ format: r.format === "edit" ? "story" : r.format, quality: r.quality, durationSec: r.durationSec, danceVoice: (r.spec as { voice?: "sung" | "chant" | "ai_song" }).voice ?? "sung" }, env.CINEMATIC_VIDEO_MODEL) ?? null;
  return (
    <>
      {lang === "ar" ? (
        // eslint-disable-next-line @next/next/no-page-custom-font -- Arabic only on this page, loaded at runtime like the app fonts
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;700&display=swap" />
      ) : null}
      <RecipePage view={view} lang={lang} festival={festival} more={more} price={{ freePerWeek: env.FREE_FILMS_PER_WEEK, credits }} />
    </>
  );
}
