import type { Resolution } from "@/lib/providers/types";

export interface Plan {
  filmsPerWeek: number;
  maxDurationSec: number;
  resolution: Resolution;
  watermark: boolean;
}

// "Free" is capped and watermarked: every free film costs real API spend.
export const FREE_PLAN: Plan = {
  filmsPerWeek: 3,
  maxDurationSec: 60,
  resolution: "720p",
  watermark: true,
};

export const CLIP_SECONDS = 5;

// USD snapshot from docs/PLAN.md (fal.ai, 2026). Re-verify before pricing anything.
const VIDEO_PRICE_PER_SEC: Record<string, Record<Resolution, number>> = {
  "wan-2.x": { "480p": 0.05, "720p": 0.1 },
  "kling-2.6": { "480p": 0.07, "720p": 0.07 },
};
const KEYFRAME_PRICE = 0.08;
const LLM_PRICE = 0.2;

export function shotCountFor(durationSec: number): number {
  return Math.max(1, Math.round(durationSec / CLIP_SECONDS));
}

export function estimateCostUsd(videoModel: string, resolution: Resolution, durationSec: number): number {
  const prices = VIDEO_PRICE_PER_SEC[videoModel];
  if (!prices) throw new Error(`No price for video model "${videoModel}"`);
  const shots = shotCountFor(durationSec);
  const video = shots * CLIP_SECONDS * prices[resolution];
  // Voice (Kokoro) and music (ACE-Step) are self-hosted and treated as ~$0.
  return Math.round((video + shots * KEYFRAME_PRICE + LLM_PRICE) * 100) / 100;
}

export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
