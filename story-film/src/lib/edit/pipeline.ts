import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { probeDuration } from "@/lib/ffmpeg";
import { assertCommercialSafe } from "@/lib/models/licenses";
import type { Brand } from "@/lib/motion/render";
import type { Ending } from "@/lib/motion/script";
import type { Stage } from "@/lib/pipeline/orchestrator";
import type { LlmProvider, NarrationLanguage } from "@/lib/providers/types";
import type { Transcript } from "@/lib/providers/whisper";
import { buildEditPrompt, type EditPlan, editPlanSchema, sanitizePlan } from "./plan";
import { type EditRenderInput, renderEdit } from "./render";

const execFileAsync = promisify(execFile);

export interface EditDeps {
  llm: LlmProvider;
  transcriber: { readonly modelId: string; transcribe(audio: Buffer, language?: string): Promise<Transcript> };
  fontsDir?: string;
  probeDuration?: (file: string) => Promise<number>;
  extractAudio?: (source: string, wav: string) => Promise<boolean>;
  render?: (input: EditRenderInput) => Promise<void>;
}

export interface EditRequest {
  source: string;
  watermark: boolean;
  language?: NarrationLanguage;
  captions?: boolean;
  zooms?: boolean;
  ending?: Ending;
  keyword?: string;
  brand?: Brand;
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

// A creator's own video: transcribe it, let the AI plan zooms and cards, then render the edit.
export async function runEditVideo(
  deps: EditDeps,
  req: EditRequest,
  workDir: string,
  onStage: (stage: Stage) => Promise<void> | void = () => {},
): Promise<{ output: string; title: string }> {
  for (const p of [deps.llm, deps.transcriber]) assertCommercialSafe(p.modelId);
  await mkdir(workDir, { recursive: true });
  const durationSec = await (deps.probeDuration ?? probeDuration)(req.source);

  await onStage("script");
  const wav = path.join(workDir, "speech.wav");
  const language = req.language && req.language !== "auto" ? req.language : undefined;
  const transcript: Transcript = (await (deps.extractAudio ?? defaultExtractAudio)(req.source, wav))
    ? await deps.transcriber.transcribe(await readFile(wav), language)
    : { text: "", words: [] };
  let plan: EditPlan = { title: "My video", zooms: [], cards: [] };
  if (transcript.words.length >= 3) {
    const raw = await deps.llm.completeJson(
      buildEditPrompt({ words: transcript.words, durationSec, language: transcript.language, ending: req.ending, keyword: req.keyword, handle: req.brand?.handle, zooms: req.zooms }),
    );
    plan = sanitizePlan(editPlanSchema.parse(raw), durationSec, req.ending);
    if (req.zooms === false) plan = { ...plan, zooms: [] };
  }
  await writeFile(path.join(workDir, "edit.json"), JSON.stringify({ transcript, plan }, null, 2));

  await onStage("assemble");
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
  });

  await onStage("done");
  return { output, title: plan.title };
}
