// The Custom-mode dials, mapped onto inputs fal's ACE-Step 1.5 really has (schema checked 2026-11-05).
// fal runs the turbo model, which ignores guidance_scale, so neither slider uses it.
//
// "Experiment" (safe -> wild): lm_temperature, how freely the planning model writes the song's codes
// (fal's default 0.85), plus stochastic "sde" sampling at the wild end for more varied takes.
// "Follow my style" (loose -> strict): lm_cfg_scale, classifier-free guidance on the style text
// (fal's default 1.0). Above 1.0 fal generates step by step, about 10x slower, so it tops out at 2.5.

export interface AceControls {
  lmTemperature?: number;
  inferMethod?: "ode" | "sde";
  lmCfgScale?: number;
  bpm?: number;
  keyScale?: string;
}

// Slider positions are 0-100. The defaults land exactly on fal's own defaults.
export const EXPERIMENT_DEFAULT = 50;
export const STYLE_STRICTNESS_DEFAULT = 0;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function experimentInputs(experiment: number): Pick<AceControls, "lmTemperature" | "inferMethod"> {
  const e = Math.min(100, Math.max(0, experiment));
  // 0 -> 0.55, 50 -> 0.85, 100 -> 1.25.
  const lmTemperature = round2(e <= 50 ? 0.55 + (e / 50) * 0.3 : 0.85 + ((e - 50) / 50) * 0.4);
  return { lmTemperature, inferMethod: e >= 80 ? "sde" : "ode" };
}

export function strictnessInputs(strictness: number): Pick<AceControls, "lmCfgScale"> {
  const s = Math.min(100, Math.max(0, strictness));
  return { lmCfgScale: round2(1 + (s / 100) * 1.5) };
}

// Strict styles are slow on fal; the form says so.
export const slowStyle = (strictness: number) => strictness > 0;

export const KEYS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
// ACE-Step's key_scale, like "A minor" or "C major". Empty means it picks the key itself.
export const KEY_SCALES = KEYS.flatMap((k) => [`${k} major`, `${k} minor`]);

export const BPM_MIN = 60;
export const BPM_MAX = 180;

// The fal input fields for these controls. Unset controls are left out, so fal uses its defaults.
export function aceInputs(c: AceControls | undefined): Record<string, string | number> {
  if (!c) return {};
  const out: Record<string, string | number> = {};
  if (c.lmTemperature !== undefined) out.lm_temperature = c.lmTemperature;
  if (c.inferMethod) out.infer_method = c.inferMethod;
  if (c.lmCfgScale !== undefined && c.lmCfgScale > 1) out.lm_cfg_scale = c.lmCfgScale;
  if (c.bpm) out.bpm = c.bpm;
  if (c.keyScale) out.key_scale = c.keyScale;
  return out;
}

// Lyria has no tempo or key fields; they go into its prompt as words.
export function controlWords(c: AceControls | undefined): string {
  return [c?.bpm ? `${c.bpm} bpm` : "", c?.keyScale ? `in ${c.keyScale}` : ""].filter(Boolean).join(", ");
}
