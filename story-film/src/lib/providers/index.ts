import path from "node:path";
import { type Env, requireKey } from "@/lib/env";
import { LocalMediaStore } from "@/lib/media";
import { defaultFfmpeg, type PipelineDeps } from "@/lib/pipeline/orchestrator";
import { AceStepMusic } from "./acestep";
import { CLOUDFLARE_DEFAULTS, cloudflareAiBase, CloudflareFluxImage } from "./cloudflare";
import { DEFAULT_FAL_MODELS, FalImageToVideo, FalNanoBanana, FalQueueClient } from "./fal";
import { KenBurnsVideo } from "./kenburns";
import { KokoroTts } from "./kokoro";
import { OpenAiCompatibleLlm } from "./llm";

export function mediaStore(env: Env): LocalMediaStore {
  return new LocalMediaStore(path.resolve(env.OUTPUT_DIR, "media"));
}

export function buildPipelineDeps(env: Env): PipelineDeps {
  const shared = {
    tts: new KokoroTts(env.KOKORO_URL, env.KOKORO_VOICE),
    music: env.ACESTEP_URL ? new AceStepMusic(env.ACESTEP_URL) : undefined,
  };
  return env.PROVIDER_MODE === "free" ? { ...buildFree(env), ...shared } : { ...buildPaid(env), ...shared };
}

export function buildLlm(env: Env): OpenAiCompatibleLlm {
  if (env.PROVIDER_MODE === "free") {
    const accountId = requireKey(env.CLOUDFLARE_ACCOUNT_ID, "CLOUDFLARE_ACCOUNT_ID");
    // Workers AI's OpenAI-compatible endpoint; JSON mode isn't relied on there.
    return new OpenAiCompatibleLlm(
      `${cloudflareAiBase(accountId)}/v1`,
      requireKey(env.CLOUDFLARE_API_TOKEN, "CLOUDFLARE_API_TOKEN"),
      env.CF_LLM_MODEL ?? CLOUDFLARE_DEFAULTS.llmModel,
      { licenseId: "llama-3.3-70b", jsonMode: false },
    );
  }
  return new OpenAiCompatibleLlm(
    "https://openrouter.ai/api/v1",
    requireKey(env.OPENROUTER_API_KEY, "OPENROUTER_API_KEY"),
    env.OPENROUTER_MODEL,
    { licenseId: "openrouter", jsonMode: true },
  );
}

export function buildImage(env: Env) {
  if (env.PROVIDER_MODE === "free") {
    return new CloudflareFluxImage(
      requireKey(env.CLOUDFLARE_ACCOUNT_ID, "CLOUDFLARE_ACCOUNT_ID"),
      requireKey(env.CLOUDFLARE_API_TOKEN, "CLOUDFLARE_API_TOKEN"),
      mediaStore(env),
      env.CF_IMAGE_MODEL ?? CLOUDFLARE_DEFAULTS.imageModel,
    );
  }
  return new FalNanoBanana(
    new FalQueueClient(requireKey(env.FAL_KEY, "FAL_KEY")),
    env.FAL_IMAGE_MODEL_ID ?? DEFAULT_FAL_MODELS.image,
    env.FAL_IMAGE_EDIT_MODEL_ID ?? DEFAULT_FAL_MODELS.imageEdit,
  );
}

function buildFree(env: Env) {
  return {
    llm: buildLlm(env),
    image: buildImage(env),
    video: new KenBurnsVideo(mediaStore(env), defaultFfmpeg),
  };
}

function buildPaid(env: Env) {
  const fal = new FalQueueClient(requireKey(env.FAL_KEY, "FAL_KEY"));
  const video =
    env.VIDEO_MODEL === "kling"
      ? new FalImageToVideo(fal, "kling-2.6", env.FAL_KLING_MODEL_ID ?? DEFAULT_FAL_MODELS.kling)
      : new FalImageToVideo(fal, "wan-2.x", env.FAL_WAN_MODEL_ID ?? DEFAULT_FAL_MODELS.wan);
  return { llm: buildLlm(env), image: buildImage(env), video };
}
