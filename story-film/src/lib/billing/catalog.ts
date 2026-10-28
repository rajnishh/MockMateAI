// Prices are in the smallest unit (paise / cents) and meant to be GST-inclusive
// for India. Placeholder numbers: tune them before launch.
export type Currency = "INR" | "USD";

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
  { id: "starter", name: "Starter", credits: 20, price: { INR: 19900, USD: 299 } },
  { id: "creator", name: "Creator", credits: 60, price: { INR: 49900, USD: 799 } },
  { id: "pro", name: "Pro", credits: 150, price: { INR: 99900, USD: 1599 } },
];

export const PLANS: Plan[] = [
  { id: "creator_monthly", name: "Creator monthly", credits: 80, price: { INR: 49900, USD: 799 }, envKey: "CREATOR_MONTHLY" },
  { id: "pro_monthly", name: "Pro monthly", credits: 200, price: { INR: 119900, USD: 1799 }, envKey: "PRO_MONTHLY" },
];

// Standard videos (pan-and-zoom, ~$0 to make) cost 1 credit once the free weekly
// allowance is used. Premium (AI-animated) costs per 5s shot: one Wan 720p clip
// plus a Nano Banana keyframe is ~$0.58, and a credit sells for ~₹6.7–10, so
// 8 credits per shot leaves a margin after Razorpay fees.
export const STANDARD_CREDITS = 1;
export const PREMIUM_CREDITS_PER_SHOT = 8;
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
