import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { probeDuration } from "@/lib/ffmpeg";
import { assertCommercialSafe } from "@/lib/models/licenses";
import type { Stage } from "@/lib/pipeline/orchestrator";
import type { LlmProvider } from "@/lib/providers/types";
import type { Transcript } from "@/lib/providers/whisper";
import { mixAudio as defaultMixAudio } from "./audio";
import { buildEditPrompt, type EditPlan, editPlanSchema, sanitizePlan, soundCues, supportedEffects } from "./plan";
import { type EditRenderInput, renderEdit } from "./render";
import { PREVIEW_FILE, previewArgs } from "./preview";
import { type EditRequest, type EditState, saveEditState } from "./state";
import { analyzeVideo, loadVision, type Vision } from "./vision";

export { applyEditChanges, type EditChanges, type EditRequest, type EditState, FREE_RERENDERS, loadEditState, saveEditState } from "./state";

const execFileAsync = promisify(execFile);

export interface EditDeps {
  llm: LlmProvider;
  transcriber: { readonly modelId: string; transcribe(audio: Buffer, language?: string): Promise<Transcript> };
  fontsDir?: string;
  probeDuration?: (file: string) => Promise<number>;
  extractAudio?: (source: string, wav: string) => Promise<boolean>;
  render?: (input: EditRenderInput) => Promise<void>;
  analyze?: (source: string, outDir: string) => Promise<Vision | null>;
  makePreview?: (source: string, output: string) => Promise<boolean>;
  mixAudio?: typeof defaultMixAudio;
}


async function defaultMakePreview(source: string, output: string): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", previewArgs(source, output));
    return true;
  } catch (err) {
    console.warn("[edit] preview failed:", (err as Error).message.slice(0, 300));
    return false;
  }
}

// 16 kHz mono WAV for transcription; false when the video has no sound.
async function defaultExtractAudio(source: string, wav: string): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", ["-y", "-v", "error", "-i", source, "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", wav]);
    return true;
  } catch {
    return false;
  }
}

// Step 1: transcribe, find the creator in the frame and let the AI plan the edit.
export async function planEdit(deps: EditDeps, req: EditRequest, workDir: string, onStage: (stage: Stage) => Promise<void> | void = () => {}): Promise<EditState> {
  for (const p of [deps.llm, deps.transcriber]) assertCommercialSafe(p.modelId);
  await mkdir(workDir, { recursive: true });
  const durationSec = await (deps.probeDuration ?? probeDuration)(req.source);

  await onStage("script");
  const wav = path.join(workDir, "speech.wav");
  const language = req.language && req.language !== "auto" ? req.language : undefined;
  const effectsOn = req.effects !== false;
  // Finding the face and the person runs while the voice is transcribed and the edit planned.
  const visionP = effectsOn ? (deps.analyze ?? analyzeVideo)(req.source, path.join(workDir, "vision")) : Promise.resolve(null);
  const previewP = (deps.makePreview ?? defaultMakePreview)(req.source, path.join(workDir, PREVIEW_FILE));
  const hasAudio = await (deps.extractAudio ?? defaultExtractAudio)(req.source, wav);
  const transcript: Transcript = hasAudio ? await deps.transcriber.transcribe(await readFile(wav), language) : { text: "", words: [] };
  let plan: EditPlan = { title: "My video", zooms: [], cards: [], effects: [] };
  if (transcript.words.length >= 3) {
    const raw = await deps.llm.completeJson(
      buildEditPrompt({
        words: transcript.words,
        durationSec,
        language: transcript.language,
        ending: req.ending,
        keyword: req.keyword,
        handle: req.brand?.handle,
        zooms: req.zooms,
        effects: effectsOn,
      }),
    );
    plan = sanitizePlan(editPlanSchema.parse(raw), durationSec, req.ending);
    if (req.zooms === false) plan = { ...plan, zooms: [] };
  }
  const [vision] = await Promise.all([visionP, previewP]);
  const available = { faces: Boolean(vision?.faces.some(Boolean)), mask: Boolean(vision?.mask) };
  plan = { ...plan, effects: supportedEffects(plan.effects, available) };
  const state: EditState = { request: req, durationSec, hasAudio, transcript, plan, available, renders: 0 };
  await saveEditState(workDir, state);
  return state;
}

// Step 2: mix the soundtrack and draw the edit. Uses only what planEdit saved.
export async function renderPlannedEdit(
  deps: Pick<EditDeps, "fontsDir" | "render" | "mixAudio">,
  state: EditState,
  workDir: string,
  onStage: (stage: Stage) => Promise<void> | void = () => {},
): Promise<{ output: string; title: string }> {
  const { request: req, plan, durationSec, transcript } = state;
  await onStage("assemble");
  const voice = req.voice ?? "natural";
  const cues = req.sounds === false ? [] : soundCues(plan);
  const audio =
    voice === "natural" && !cues.length
      ? null
      : await (deps.mixAudio ?? defaultMixAudio)({
          source: req.source,
          hasAudio: state.hasAudio,
          voice,
          durationSec,
          cues,
          soundsDir: path.join(workDir, "sounds"),
          output: path.join(workDir, "soundtrack.m4a"),
        });
  const output = path.join(workDir, "film.mp4");
  await (deps.render ?? renderEdit)({
    source: req.source,
    output,
    durationSec,
    plan,
    words: transcript.words,
    captions: req.captions !== false,
    brand: req.brand,
    watermark: req.watermark,
    language: transcript.language,
    fontsDir: path.resolve(/*turbopackIgnore: true*/ deps.fontsDir ?? "assets/fonts"),
    vision: plan.effects.length ? await loadVision(path.join(workDir, "vision")) : null,
    audio,
  });

  await onStage("done");
  return { output, title: plan.title };
}

// A creator's own video, start to finish; with review, it stops after planning so they can check it.
export async function runEditVideo(
  deps: EditDeps,
  req: EditRequest,
  workDir: string,
  onStage: (stage: Stage) => Promise<void> | void = () => {},
): Promise<{ output: string | null; title: string }> {
  const state = await planEdit(deps, req, workDir, onStage);
  if (req.review) return { output: null, title: state.plan.title };
  return renderPlannedEdit(deps, state, workDir, onStage);
}
