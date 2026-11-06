import type { MakerEarns, RecipeFormat, RecipeHas, ShapeRole } from "./api";

// Reel recipes in the app (design/community/recipes-spec.md; the server side is
// story-film/src/lib/recipes.ts and src/lib/recipe-spec.ts).

export const FORMAT_WORD: Record<RecipeFormat, string> = { story: "Story", motion: "Motion", dance: "Kids dance", edit: "Edit my video" };
export const ROLE_LABEL: Record<ShapeRole, string> = { hook: "Hook", beat: "Beat", turn: "Turn", payoff: "Payoff", cta: "Call to action" };
const QUALITY: Record<string, string> = { standard: "Standard", premium: "AI animation", cinematic: "Cinematic" };
export const qualityLabel = (q: string) => QUALITY[q] ?? q;

// "Hook → 4 beats → Payoff".
export function shapeText(has: Extract<RecipeHas, { format: "story" }>): string {
  const { first, middle, last } = has.shape;
  return `${ROLE_LABEL[first]} → ${middle} ${middle === 1 ? "beat" : "beats"} → ${ROLE_LABEL[last]}`;
}

// The rows "The recipe has" (and C5's locked rows) list.
export function recipeMeta(has: RecipeHas): { label: string; value: string }[] {
  const length = { label: "Length", value: `${has.durationSec} s` };
  switch (has.format) {
    case "story":
      return [{ label: "Look", value: has.styleLabel }, { label: "Script shape", value: shapeText(has) }, { label: "Music", value: "this reel's track" }, length];
    case "motion":
      return [{ label: "Theme", value: has.theme }, { label: "Slides", value: `${has.slides.length} in the recipe's order` }, { label: "Music", value: "follows the theme" }, length];
    case "dance":
      return [{ label: "Scene", value: has.scene }, { label: "Dancers", value: `${has.dancers} cartoon kids, their looks and moves` }, { label: "Beat", value: `${has.bpm} bpm` }, length];
    case "edit":
      return [
        { label: "Effects", value: has.mix.length ? has.mix.join(", ") : "none" },
        { label: "Captions, zooms and sounds", value: [has.captions && "captions", has.zooms && "zooms", has.sounds && "sounds"].filter(Boolean).join(", ") || "off" },
        { label: "Voice polish", value: has.voice },
      ];
  }
}

// What the maker earns from this use, for C5's line under the button (rounded down to whole credits).
export function earnsLine(handle: string, e: MakerEarns | undefined): string {
  if (!e) return "Makers earn 10% of the paid credits people spend on their recipes.";
  if (e.kind === "own") return "Your recipe · you don't earn from your own uses.";
  if (e.kind === "n") return `@${handle} earns ${Math.floor(e.hundredths / 100)} credits from this. It costs you the same.`;
  if (e.kind === "small") return `@${handle} earns a small share. It costs you the same.`;
  return `@${handle} will see that their recipe was used.`;
}

// The same sum as the server (src/lib/billing/earnings.ts), when the user picks another quality.
export function earnsFor(credits: number, paidRatioBp: number, rateBp: number): MakerEarns {
  const hundredths = Math.floor((credits * paidRatioBp * rateBp) / 1_000_000);
  return { hundredths, kind: hundredths >= 100 ? "n" : hundredths > 0 ? "small" : "free" };
}
