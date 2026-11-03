// The creator's reel look on the web, kept in the browser like the mobile app keeps it on the phone.
// Sent with motion reels, video edits and Ask Reelkar turns; the server validates it again.
export type BrandPrefs = { accent?: string; background?: "light" | "dark"; handle?: string };

const KEY = "reelkar.brand";

export const BRAND_COLOURS = ["#e0198a", "#c2410c", "#0a756b", "#2563eb", "#7c3aed", "#111827"] as const;

export function cleanBrand(b: BrandPrefs): BrandPrefs | undefined {
  const out: BrandPrefs = {};
  if (b.accent && /^#[0-9a-f]{6}$/i.test(b.accent)) out.accent = b.accent.toLowerCase();
  if (b.background === "light" || b.background === "dark") out.background = b.background;
  const handle = b.handle?.replace(/\s/g, "").slice(0, 30);
  if (handle && handle !== "@") out.handle = handle.startsWith("@") ? handle : `@${handle}`.slice(0, 30);
  return Object.keys(out).length ? out : undefined;
}

export function loadBrand(): BrandPrefs | undefined {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? cleanBrand(JSON.parse(raw)) : undefined;
  } catch {
    return undefined;
  }
}

export function saveBrand(b: BrandPrefs): BrandPrefs | undefined {
  const clean = cleanBrand(b);
  try {
    if (clean) window.localStorage.setItem(KEY, JSON.stringify(clean));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Private windows can block storage; the look then lasts for this visit only.
  }
  return clean;
}
