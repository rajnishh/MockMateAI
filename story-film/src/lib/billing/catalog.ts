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
  // Consumable In-App Purchase product in App Store Connect (iPhone app, decision 10). The iPhone app
  // shows the App Store's own localized price for it, never `price`.
  appStoreProductId?: string;
}

export interface Plan extends Pack {
  // Razorpay plan ids come from env (created once with `npm run billing:plans`).
  envKey: string;
}

export const PACKS: Pack[] = [
  { id: "starter", name: "Starter", credits: 50, price: { INR: 24900, USD: 399, AED: 1500 }, appStoreProductId: "app.reelkar.credits.starter" },
  { id: "creator", name: "Creator", credits: 150, price: { INR: 64900, USD: 999, AED: 3700 }, appStoreProductId: "app.reelkar.credits.creator" },
  { id: "pro", name: "Pro", credits: 400, price: { INR: 149900, USD: 2499, AED: 9200 }, appStoreProductId: "app.reelkar.credits.pro" },
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
// Cinematic (hyper-real, 1080p) per 5s shot, by video model, from fal's pricing API on 2026-11-05:
// Kling 3.0 Pro $0.14/s, so ~$0.70 plus a $0.08 keyframe (~₹69); Veo 3.1 $0.40/s for a 6s clip, so
// ~$2.40 plus the keyframe (~₹218). fal lists one rate per model, which may be the audio-on rate, so
// these are on the safe side. At ₹3.1 a credit after GST they keep the ~30% worst-case margin.
export const CINEMATIC_CREDITS_PER_SHOT = { kling: 30, veo: 92 } as const;
// "Sing it yourself" music videos: the star lip-syncs each scene with Kling AI Avatar v2 (standard
// $0.0562/s for AI animation, pro $0.115/s for Cinematic) plus a keyframe, per 5s of song.
export const SINGER_CREDITS_PER_SHOT = { premium: 16, cinematic: 30 } as const;
// Songs are priced per take (decision 42). ACE-Step on fal is $0.0002 per second, so a 2-minute take
// is ~$0.024 (~₹2.1); Lyria 3 is $0.04 per 30 s take (~₹3.5), both from fal's pricing API on 2026-11-05.
// At the worst-case ₹3.1 a credit after GST, 1 and 2 credits a take keep a ~30%+ margin.
export const SONG_CREDITS_PER_TAKE = { "ace-step": 1, lyria: 2 } as const;
export function songCredits(model: keyof typeof SONG_CREDITS_PER_TAKE, takes: number): number {
  return SONG_CREDITS_PER_TAKE[model] * takes;
}
// The usual Create: two ACE-Step takes to choose from.
export const SONG_CREDITS = songCredits("ace-step", 2);
// A dance reel sung by ACE-Step instead of Reelkar's free sung chant: one short take.
// It never uses the free weekly allowance.
export const DANCE_SONG_CREDITS = songCredits("ace-step", 1);
// Music videos: Standard (pan-and-zoom scenes, ~$0 to make) is a flat price;
// Premium animates every 5s scene with AI at the usual per-shot price.
export const MUSIC_VIDEO_STANDARD_CREDITS = 2;
// Music videos by kind (Song Studio 2). PLACEHOLDER PRICES: the user hasn't picked final prices;
// change these constants and every screen follows (GET /api/songs/[id]/music-video sends them).
// Our cost per 5 s of song, from fal's pricing API on 2026-11-05: Story = Kling 3 Pro $0.70 + a
// $0.08 keyframe; Performance = OmniHuman 1.5 $0.80 + keyframe + Demucs; Full ≈ 40% singing,
// 25% Kling motion control ($0.84), 35% Kling 3 scenes, plus keyframes and the star picture.
// At ~43 credits a dollar (a 5 s Cinematic shot is $0.70 for 30 credits) each keeps a 30%+ margin.
// The lyric video is free to make (Flux pictures and ffmpeg), so it's a flat price.
export const LYRIC_VIDEO_CREDITS = 2;
export const MUSIC_VIDEO_CREDITS_PER_5S = { story: 34, performance: 36, full: 40 } as const;
// Free storyboards (shot list and pictures) a creator may make per day before paying for one.
export const FREE_STORYBOARDS_PER_DAY = 6;
// Pictures a creator may redraw in one storyboard.
export const STORYBOARD_REDRAWS = 8;

export function musicVideoKindCredits(kind: "lyric" | keyof typeof MUSIC_VIDEO_CREDITS_PER_5S, durationSec: number): number {
  if (kind === "lyric") return LYRIC_VIDEO_CREDITS;
  return Math.ceil(durationSec / 5) * MUSIC_VIDEO_CREDITS_PER_5S[kind];
}

// Re-singing a song in the user's voice: separation plus voice conversion.
export const MY_VOICE_CREDITS = 4;

// Paid music videos are priced per 5s of song: AI animation, Cinematic (by its video model), or the
// star lip-syncing every scene ("sing it yourself").
export function musicVideoCredits(
  quality: "standard" | "premium" | "cinematic",
  durationSec: number,
  opts: { singer?: boolean; cinematicModel?: keyof typeof CINEMATIC_CREDITS_PER_SHOT } = {},
): number {
  if (quality === "standard") return MUSIC_VIDEO_STANDARD_CREDITS;
  const perShot = opts.singer
    ? SINGER_CREDITS_PER_SHOT[quality]
    : quality === "cinematic"
      ? CINEMATIC_CREDITS_PER_SHOT[opts.cinematicModel ?? "kling"]
      : PREMIUM_CREDITS_PER_SHOT;
  return Math.ceil(durationSec / 5) * perShot;
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

// Song remixes (ACE-Step edit endpoints on fal, ~$0.0002 per second of audio, so a 2-minute
// song costs under 3 cents): a cover or extension regenerates the whole song, a replaced part
// only a slice of it. Verify fal's prices before launch.
// Adding vocals or music (ACE-Step 1.5 on Runware, ~$0.01 a call, plus two Demucs splits on fal,
// ~$0.04 a minute each, so ~$0.2 for a 2-minute song) costs more. Covers, extensions and replaced
// parts on Runware cost about the same as on fal. A rap is a replaced part.
export const REMIX_CREDITS = { cover: 1, extend: 1, replace: 1, rap: 1, "add-vocals": 6, "add-instrumental": 6 } as const;
// Splitting a song into vocals, drums, bass and music (Demucs on fal, ~$0.04 a minute). Made once per
// song; mixing them afterwards is free.
export const STEMS_CREDITS = 1;

// "Hum it": a song on the creator's own hummed or sung tune (ACE-Step audio-to-audio on fal, $0.0002 per
// second of audio from fal's pricing API on 2026-11-05, so a 60 s take is ~1 cent), priced like a cover.
export const TUNE_SONG_CREDITS = REMIX_CREDITS.cover;

// Creator earnings (design/community/remix-spec.md, shared with reel recipes): the maker of a remixed
// song, or of a recipe, earns this share of the paid credits the remix or reel spends, in basis
// points (1000 = 10%). PLACEHOLDER: the owner may change it; every earning row keeps the rate it used.
export const EARN_RATE_BP = 1000;
