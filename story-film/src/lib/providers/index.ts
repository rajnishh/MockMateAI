import { type Env, requireKey } from "@/lib/env";
import type { PipelineDeps } from "@/lib/pipeline/orchestrator";
import { AceStepMusic } from "./acestep";
import { DEFAULT_FAL_MODELS, FalImageToVideo, FalNanoBanana, FalQueueClient } from "./fal";
import { KokoroTts } from "./kokoro";
import { OpenRouterLlm } from "./openrouter";

export function buildPipelineDeps(env: Env): PipelineDeps {
  const fal = new FalQueueClient(requireKey(env.FAL_KEY, "FAL_KEY"));
  const video =
    env.VIDEO_MODEL === "kling"
      ? new FalImageToVideo(fal, "kling-2.6", env.FAL_KLING_MODEL_ID ?? DEFAULT_FAL_MODELS.kling)
      : new FalImageToVideo(fal, "wan-2.x", env.FAL_WAN_MODEL_ID ?? DEFAULT_FAL_MODELS.wan);
  return {
    llm: new OpenRouterLlm(requireKey(env.OPENROUTER_API_KEY, "OPENROUTER_API_KEY"), env.OPENROUTER_MODEL),
    image: new FalNanoBanana(
      fal,
      env.FAL_IMAGE_MODEL_ID ?? DEFAULT_FAL_MODELS.image,
      env.FAL_IMAGE_EDIT_MODEL_ID ?? DEFAULT_FAL_MODELS.imageEdit,
    ),
    video,
    tts: new KokoroTts(env.KOKORO_URL, env.KOKORO_VOICE),
    music: new AceStepMusic(env.ACESTEP_URL),
  };
}
