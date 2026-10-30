import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Brand } from "@/lib/motion/render";
import type { Ending } from "@/lib/motion/script";
import type { NarrationLanguage } from "@/lib/providers/types";
import type { Transcript } from "@/lib/providers/whisper";
import type { Voice } from "./audio";
import { type EditPlan, editPlanSchema, sanitizePlan, supportedEffects } from "./plan";

// Saved edit plans, kept apart from the renderer so the web app can read and change them.
export interface EditRequest {
  source: string;
  watermark: boolean;
  language?: NarrationLanguage;
  captions?: boolean;
  zooms?: boolean;
  // Face-aware effects (word behind you, spotlight, sticker, stamp, focus brackets).
  effects?: boolean;
  sounds?: boolean;
  voice?: Voice;
  // Stop after planning so the creator can check each effect before rendering.
  review?: boolean;
  ending?: Ending;
  keyword?: string;
  brand?: Brand;
}

// Everything needed to render (or re-render) an edit without transcribing or analysing again.
export interface EditState {
  request: EditRequest;
  durationSec: number;
  hasAudio: boolean;
  transcript: Transcript;
  plan: EditPlan;
  // What the video analysis found; decides which effects the creator can pick.
  available: { faces: boolean; mask: boolean };
  // Re-renders after the first one (a few are free).
  renders: number;
}

export const FREE_RERENDERS = 5;
const STATE_FILE = "edit.json";

export async function loadEditState(workDir: string): Promise<EditState> {
  return JSON.parse(await readFile(path.join(workDir, STATE_FILE), "utf8")) as EditState;
}

export async function saveEditState(workDir: string, state: EditState): Promise<void> {
  await writeFile(path.join(workDir, STATE_FILE), JSON.stringify(state, null, 2));
}

export interface EditChanges {
  plan: EditPlan;
  captions?: boolean;
  sounds?: boolean;
  voice?: Voice;
}

// The creator's own changes: kept inside the video and limited to what the analysis supports.
export function applyEditChanges(state: EditState, changes: EditChanges): EditState {
  const plan = sanitizePlan(editPlanSchema.parse(changes.plan), state.durationSec, state.request.ending);
  return {
    ...state,
    plan: { ...plan, effects: supportedEffects(plan.effects, state.available) },
    request: {
      ...state.request,
      captions: changes.captions ?? state.request.captions,
      sounds: changes.sounds ?? state.request.sounds,
      voice: changes.voice ?? state.request.voice,
    },
  };
}

