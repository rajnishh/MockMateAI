import { describe, expect, it } from "vitest";
import { cleanBrand } from "@/lib/brand-prefs";
import { brandPalette as fromBrand } from "@/lib/motion/brand";
import { brandPalette as fromRender, THEMES } from "@/lib/motion/render";
import { filmJobSchema } from "@/lib/queue/films";

describe("web Brand kit", () => {
  it("keeps only what the server accepts", () => {
    expect(cleanBrand({ accent: "#E0198A", background: "dark", handle: " my chai " })).toEqual({ accent: "#e0198a", background: "dark", handle: "@mychai" });
    expect(cleanBrand({ accent: "red", handle: "@" })).toBeUndefined();
    expect(cleanBrand({ handle: "a".repeat(40) })?.handle).toHaveLength(30);
    expect(cleanBrand({ background: "sepia" as "light" })).toBeUndefined();
  });

  it("passes the motion reel schema", () => {
    const brand = cleanBrand({ accent: "#7c3aed", background: "light", handle: "kitchen_tales" });
    const parsed = filmJobSchema.safeParse({ userId: "u", story: "Three chai mistakes everyone makes", style: "animated", durationSec: 30, format: "motion", brand });
    expect(parsed.success).toBe(true);
  });

  it("previews with the same palette the renderer uses", () => {
    expect(fromRender).toBe(fromBrand);
    expect(fromBrand({ accent: "#ffd23f", background: "light" }, THEMES.navy).accent).not.toBe("#ffd23f");
  });
});
