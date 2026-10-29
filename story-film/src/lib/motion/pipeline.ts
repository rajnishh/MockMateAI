import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { probeDuration } from "@/lib/ffmpeg";
import { assertCommercialSafe } from "@/lib/models/licenses";
import { mapLimit, type Stage } from "@/lib/pipeline/orchestrator";
import type { LlmProvider, MusicProvider, NarrationLanguage, TtsProvider } from "@/lib/providers/types";
import { type Brand, MOTION_SIZE, renderMotionVideo, type RenderInput } from "./render";
import { applyEnding, buildMotionPrompt, type Ending, type MotionScript, motionScriptSchema, slideDurations } from "./script";

export interface MotionDeps {
  llm: LlmProvider;
  tts: TtsProvider;
  music?: MusicProvider;
  fontsDir?: string;
  probeDuration?: (file: string) => Promise<number>;
  render?: (input: RenderInput) => Promise<void>;
}

export interface MotionRequest {
  story: string;
  durationSec: number;
  watermark: boolean;
  language?: NarrationLanguage;
  kidSafe?: boolean;
  captions?: boolean;
  ending?: Ending;
  keyword?: string;
  brand?: Brand;
}

const MUSIC_BY_THEME: Record<MotionScript["theme"], string> = {
  navy: "modern minimal electronic, confident, light percussion, 100 bpm, instrumental",
  saffron: "warm Indian acoustic, tabla and sitar accents, cheerful, 95 bpm, instrumental",
  mint: "bright upbeat ukulele and claps, fresh and positive, 110 bpm, instrumental",
  night: "dark cinematic pulse, bold synth bass, 90 bpm, instrumental",
};

// Text-and-graphics reel: script → voice-over → animated frames. No image or video models.
export async function runMotionReel(
  deps: MotionDeps,
  req: MotionRequest,
  workDir: string,
  onStage: (stage: Stage) => Promise<void> | void = () => {},
): Promise<{ output: string; title: string }> {
  for (const p of [deps.llm, deps.tts, deps.music]) if (p) assertCommercialSafe(p.modelId);
  await mkdir(workDir, { recursive: true });

  await onStage("script");
  const raw = await deps.llm.completeJson(buildMotionPrompt({ ...req, handle: req.brand?.handle }));
  const script = applyEnding(motionScriptSchema.parse(raw), req.ending);
  await writeFile(path.join(workDir, "script.json"), JSON.stringify(script, null, 2));

  await onStage("audio");
  const narration = await mapLimit(script.slides, 3, async (slide, i) => {
    const file = path.join(workDir, `narration-${i}.wav`);
    await writeFile(file, await deps.tts.speak({ text: slide.narration, language: script.language }));
    return file;
  });
  const spoken = await Promise.all(narration.map(deps.probeDuration ?? probeDuration));
  const durations = slideDurations(script, spoken);
  let music: string | undefined;
  if (deps.music) {
    music = path.join(workDir, "music.wav");
    const total = durations.reduce((a, b) => a + b, 0);
    await writeFile(music, await deps.music.compose({ prompt: MUSIC_BY_THEME[script.theme], durationSec: Math.ceil(total) }));
  }

  await onStage("assemble");
  const { w, h } = MOTION_SIZE;
  const output = path.join(workDir, "film.mp4");
  await (deps.render ?? renderMotionVideo)({
    script,
    durations,
    narration,
    spoken,
    captions: req.captions,
    brand: req.brand,
    music,
    width: w,
    height: h,
    watermark: req.watermark,
    fontsDir: path.resolve(/*turbopackIgnore: true*/ deps.fontsDir ?? "assets/fonts"),
    output,
  });

  await onStage("done");
  return { output, title: script.title };
}
