// The creator's brand look and the readable palette made from it. No Node imports, so the web
// Brand kit can preview exactly what motion reels and edits will use.

export interface Palette {
  bg: [string, string];
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  highlight: string;
  blob: string;
}

export interface Brand {
  // Creator's brand colour, e.g. "#e0198a".
  accent?: string;
  background?: "light" | "dark";
  handle?: string;
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = hexRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

// A palette from the creator's brand colour. Text stays near black or white for readability;
// the brand colour fills buttons and highlights, and is darkened or lightened until it reads on the background.
export function brandPalette(brand: Brand, fallback: Palette): Palette {
  if (!brand.accent || !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(brand.accent)) return fallback;
  const dark = brand.background === "dark";
  const bg: [string, string] = dark ? ["#121318", "#08090c"] : ["#fbfaf7", "#f1efe9"];
  const [r, g, b] = hexRgb(brand.accent);
  const onFor = (c: string) => (contrastRatio("#ffffff", c) >= contrastRatio("#111111", c) ? "#ffffff" : "#111111");
  // Darken (light background) or lighten (dark background) until the colour reads on the
  // background and its button text reads on it; both improve in the same direction.
  let accent = brand.accent;
  for (let k = 1; k <= 12 && (contrastRatio(accent, bg[0]) < 3 || contrastRatio(onFor(accent), accent) < 4.5); k++) {
    const c = (v: number) => Math.max(0, Math.min(255, Math.round(dark ? v + (255 - v) * 0.08 * k : v * (1 - 0.07 * k))));
    accent = `#${[c(r), c(g), c(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }
  return {
    bg,
    text: dark ? "#f6f6f8" : "#16161a",
    muted: dark ? "#b8b8c4" : "#55555f",
    accent,
    onAccent: onFor(accent),
    highlight: accent,
    blob: `rgba(${hexRgb(accent).join(",")},${dark ? 0.14 : 0.07})`,
  };
}
