import { readFile } from "node:fs/promises";
import { ImageResponse } from "next/og";
import { getDb } from "@/lib/db";
import { findFestival } from "@/lib/festivals";
import { publicRecipe, recipeState } from "@/lib/recipes";

// The picture in the WhatsApp preview: the poster frame on the left, the hero panel with "A reel
// recipe", the name, the maker and the AI label on the right. Long names stop after 2 lines.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A reel recipe, made with AI on Reelkar";

export default async function Image({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const found = await publicRecipe(getDb(), publicId);
  const live = found && recipeState(found.recipe) === "public" ? found : null;
  const poster = live?.recipe.posterPath ? await readFile(live.recipe.posterPath).catch(() => null) : null;
  const festival = live?.recipe.occasions[0] ? findFestival(live.recipe.occasions[0])?.name.en : undefined;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#2a1235", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", width: 630, height: 630, overflow: "hidden", background: "radial-gradient(circle at 30% 30%, #ffb21a, #ff4d2e 60%, #2a1235)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered into the PNG, not the page */}
          {poster ? <img src={`data:image/jpeg;base64,${poster.toString("base64")}`} width={630} height={1120} style={{ objectFit: "cover", marginTop: -245 }} alt="" /> : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 22, flex: 1, padding: 48, background: "linear-gradient(135deg, #ffb21a 0%, #ff7a1a 100%)", color: "#2a1235" }}>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 3 }}>{festival ? `A ${festival.toUpperCase()} REEL RECIPE` : "A REEL RECIPE"}</div>
          <div style={{ display: "flex", fontSize: 60, fontWeight: 800, lineHeight: 1.08, maxHeight: 132, overflow: "hidden" }}>{live?.recipe.name ?? "Reelkar"}</div>
          {live ? <div style={{ fontSize: 30, fontWeight: 600 }}>{`by @${live.handle}`}</div> : null}
          <div style={{ display: "flex", fontSize: 24, fontWeight: 600, background: "rgba(42,18,53,0.12)", borderRadius: 999, padding: "8px 22px", alignSelf: "flex-start" }}>Made with AI</div>
        </div>
      </div>
    ),
    size,
  );
}
