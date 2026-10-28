// Prices are in the smallest unit (paise / cents / fils) and include tax:
// GST for India (INR), UAE VAT for AED. USD prices are tax-exclusive where a
// buyer's local tax applies. Set 2026-10-28 from the cost model in
// docs/PLAN.md (decision 20): a premium 5s shot costs about ₹25 to make, so
// every pack and plan keeps at least ~30% margin even if all its credits go
// to premium shots.
export type Currency = "INR" | "USD" | "AED";
export const CURRENCIES: Currency[] = ["INR", "USD", "AED"];

export interface Pack {
  id: string;
  name: string;
  credits: number;
  price: Record<Currency, number>;
}

export interface Plan extends Pack {
  // Razorpay plan ids come from env (created once with `npm run billing:plans`).
  envKey: string;
}

export const PACKS: Pack[] = [
  { id: "starter", name: "Starter", credits: 50, price: { INR: 24900, USD: 399, AED: 1500 } },
  { id: "creator", name: "Creator", credits: 150, price: { INR: 64900, USD: 999, AED: 3700 } },
  { id: "pro", name: "Pro", credits: 400, price: { INR: 149900, USD: 2499, AED: 9200 } },
];

export const PLANS: Plan[] = [
  { id: "creator_monthly", name: "Creator monthly", credits: 120, price: { INR: 49900, USD: 799, AED: 2900 }, envKey: "CREATOR_MONTHLY" },
  { id: "pro_monthly", name: "Pro monthly", credits: 350, price: { INR: 129900, USD: 1999, AED: 7500 }, envKey: "PRO_MONTHLY" },
];

// One-time gift on sign-up: enough for a first premium reel or a week of standard ones.
export const WELCOME_CREDITS = 20;

// Visitors see the currency of where they are; they can switch on the billing page.
export function currencyForTimeZone(timeZone: string | undefined): Currency {
  if (timeZone === "Asia/Kolkata" || timeZone === "Asia/Calcutta") return "INR";
  if (timeZone === "Asia/Dubai") return "AED";
  return "USD";
}

// Standard videos (pan-and-zoom, ~$0 to make) cost 1 credit once the free weekly
// allowance is used. Premium (AI-animated) costs per 5s shot: a Wan 480p clip
// plus a keyframe is ~$0.30 (~₹25); credits sell for ₹3.7–5 (₹3.1–4.2 after
// GST), so 12 credits per shot keeps a margin on every pack and plan.
export const STANDARD_CREDITS = 1;
export const PREMIUM_CREDITS_PER_SHOT = 12;
// One song of up to 2 minutes (ACE-Step on fal.ai); verify fal's price before launch.
export const SONG_CREDITS = 4;
// Music videos: Standard (pan-and-zoom scenes, ~$0 to make) is a flat price;
// Premium animates every 5s scene with AI at the usual per-shot price.
export const MUSIC_VIDEO_STANDARD_CREDITS = 2;
// Re-singing a song in the user's voice: separation plus voice conversion.
export const MY_VOICE_CREDITS = 4;

export function musicVideoCredits(quality: "standard" | "premium", durationSec: number): number {
  return quality === "standard" ? MUSIC_VIDEO_STANDARD_CREDITS : Math.ceil(durationSec / 5) * PREMIUM_CREDITS_PER_SHOT;
}

export function planEnvName(plan: Plan, currency: Currency): string {
  return `RAZORPAY_PLAN_${plan.envKey}_${currency}`;
}

export function findPack(id: string): Pack | undefined {
  return PACKS.find((p) => p.id === id);
}

export function findPlan(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}
