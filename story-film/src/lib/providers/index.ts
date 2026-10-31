import path from "node:path";
import { type Env, requireKey } from "@/lib/env";
import { LocalMediaStore } from "@/lib/media";
import { defaultFfmpeg } from "@/lib/ffmpeg";
import type { PipelineDeps } from "@/lib/pipeline/orchestrator";
import { AceStepMusic } from "./acestep";
import { CLOUDFLARE_DEFAULTS, cloudflareAiBase, CloudflareFluxImage } from "./cloudflare";
import { DEFAULT_FAL_MODELS, FalImageToVideo, FalNanoBanana, FalQueueClient } from "./fal";
import { FalAceStep } from "./fal-music";
import { FalChatterboxVc, FalDemucs, SeedVcServer } from "./voice";
import { CloudflareTranscriber, CloudflareWhisper } from "./whisper";
import { KenBurnsVideo } from "./kenburns";
import { KokoroTts } from "./kokoro";
import { FalChatterboxTts, RoutedTts, SarvamTts } from "./tts";
import { OpenAiCompatibleLlm } from "./llm";

// standard: Cloudflare Workers AI images + local pan-and-zoom, ~$0 per video.
// premium: fal.ai Nano Banana 2 images + Wan/Kling AI animation, paid with credits.
export type Quality = "standard" | "premium";

export function mediaStore(env: Env): LocalMediaStore {
  return new LocalMediaStore(path.resolve(env.OUTPUT_DIR, "media"));
}

export function premiumAvailable(env: Env): boolean {
  return Boolean(env.FAL_KEY);
}

export function buildPipelineDeps(env: Env, quality: Quality = "standard"): PipelineDeps {
  return {
    llm: buildLlm(env),
    image: buildImage(env, quality),
    video: quality === "premium" ? buildAiVideo(env) : new KenBurnsVideo(mediaStore(env), defaultFfmpeg),
    tts: buildTts(env),
    music: buildMusic(env, quality),
  };
}

// English and Hindi via Kokoro; other Indian languages via Sarvam; Arabic via
// Chatterbox on fal. Languages whose engine isn't configured are unavailable.
export function buildTts(env: Env): RoutedTts {
  return new RoutedTts({
    kokoro: new KokoroTts(env.KOKORO_URL, env.KOKORO_VOICE),
    sarvam: env.SARVAM_API_KEY ? new SarvamTts(env.SARVAM_API_KEY, env.SARVAM_TTS_MODEL) : undefined,
    chatterbox: env.FAL_KEY ? new FalChatterboxTts(new FalQueueClient(env.FAL_KEY)) : undefined,
  });
}

// Self-hosted ACE-Step when configured; otherwise premium videos use ACE-Step on fal.
function buildMusic(env: Env, quality: Quality) {
  if (env.ACESTEP_URL) return new AceStepMusic(env.ACESTEP_URL);
  if (quality === "premium" && env.FAL_KEY) return new FalAceStep(new FalQueueClient(env.FAL_KEY));
  return undefined;
}

export function songsAvailable(env: Env): boolean {
  return Boolean(env.FAL_KEY);
}

export function buildSongProvider(env: Env): FalAceStep {
  return new FalAceStep(new FalQueueClient(requireKey(env.FAL_KEY, "FAL_KEY")));
}

// "Sing in my voice" needs fal (separation) and Whisper (consent check).
export function myVoiceAvailable(env: Env): boolean {
  return Boolean(env.FAL_KEY && env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN);
}

export function buildWhisper(env: Env): CloudflareWhisper {
  return new CloudflareWhisper(
    requireKey(env.CLOUDFLARE_ACCOUNT_ID, "CLOUDFLARE_ACCOUNT_ID"),
    requireKey(env.CLOUDFLARE_API_TOKEN, "CLOUDFLARE_API_TOKEN"),
  );
}

// "Edit my video" needs word-timed transcripts (Cloudflare) for captions and the edit plan.
export function editsAvailable(env: Env): boolean {
  return Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN);
}

export function buildTranscriber(env: Env): CloudflareTranscriber {
  return new CloudflareTranscriber(
    requireKey(env.CLOUDFLARE_ACCOUNT_ID, "CLOUDFLARE_ACCOUNT_ID"),
    requireKey(env.CLOUDFLARE_API_TOKEN, "CLOUDFLARE_API_TOKEN"),
  );
}

// Seed-VC keeps the melody better; Chatterbox works with just a fal key.
export function buildSingDeps(env: Env) {
  const fal = new FalQueueClient(requireKey(env.FAL_KEY, "FAL_KEY"));
  return {
    separator: new FalDemucs(fal),
    converter: env.SEEDVC_URL ? new SeedVcServer(env.SEEDVC_URL) : new FalChatterboxVc(fal),
  };
}

// OpenRouter when configured (stronger models), otherwise the free Workers AI Llama.
export function buildLlm(env: Env): OpenAiCompatibleLlm {
  if (env.OPENROUTER_API_KEY) {
    return new OpenAiCompatibleLlm("https://openrouter.ai/api/v1", env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL, {
      licenseId: "openrouter",
      jsonMode: true,
    });
  }
  const accountId = requireKey(env.CLOUDFLARE_ACCOUNT_ID, "CLOUDFLARE_ACCOUNT_ID");
  // Workers AI's OpenAI-compatible endpoint; JSON mode isn't relied on there.
  return new OpenAiCompatibleLlm(
    `${cloudflareAiBase(accountId)}/v1`,
    requireKey(env.CLOUDFLARE_API_TOKEN, "CLOUDFLARE_API_TOKEN"),
    env.CF_LLM_MODEL ?? CLOUDFLARE_DEFAULTS.llmModel,
    { licenseId: "llama-3.3-70b", jsonMode: false },
  );
}

export function buildImage(env: Env, quality: Quality = "standard") {
  if (quality === "premium") {
    return new FalNanoBanana(
      new FalQueueClient(requireKey(env.FAL_KEY, "FAL_KEY")),
      env.FAL_IMAGE_MODEL_ID ?? DEFAULT_FAL_MODELS.image,
      env.FAL_IMAGE_EDIT_MODEL_ID ?? DEFAULT_FAL_MODELS.imageEdit,
    );
  }
  return new CloudflareFluxImage(
    requireKey(env.CLOUDFLARE_ACCOUNT_ID, "CLOUDFLARE_ACCOUNT_ID"),
    requireKey(env.CLOUDFLARE_API_TOKEN, "CLOUDFLARE_API_TOKEN"),
    mediaStore(env),
    env.CF_IMAGE_MODEL ?? CLOUDFLARE_DEFAULTS.imageModel,
  );
}

function buildAiVideo(env: Env) {
  const fal = new FalQueueClient(requireKey(env.FAL_KEY, "FAL_KEY"));
  return env.VIDEO_MODEL === "kling"
    ? new FalImageToVideo(fal, "kling-2.6", env.FAL_KLING_MODEL_ID ?? DEFAULT_FAL_MODELS.kling)
    : new FalImageToVideo(fal, "wan-2.x", env.FAL_WAN_MODEL_ID ?? DEFAULT_FAL_MODELS.wan);
}
