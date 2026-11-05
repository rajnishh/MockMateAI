import path from "node:path";
import { type Env, requireKey } from "@/lib/env";
import { LocalMediaStore } from "@/lib/media";
import { defaultFfmpeg } from "@/lib/ffmpeg";
import type { PipelineDeps } from "@/lib/pipeline/orchestrator";
import { AceStepMusic } from "./acestep";
import { CLOUDFLARE_DEFAULTS, cloudflareAiBase, CloudflareFluxImage } from "./cloudflare";
import { DEFAULT_FAL_MODELS, FalAvatarSinger, FalImageToVideo, FalNanoBanana, FalQueueClient } from "./fal";
import { FalAceStep, FalLyria } from "./fal-music";
import { FalSongEditor } from "./fal-song-edit";
import { RunwareSongEditor } from "./runware-song-edit";
import { FalChatterboxVc, FalDemucs, SeedVcServer } from "./voice";
import { CloudflareTranscriber, CloudflareWhisper } from "./whisper";
import { KenBurnsVideo } from "./kenburns";
import { KokoroTts } from "./kokoro";
import { FalChatterboxTts, RoutedTts, SarvamTts } from "./tts";
import { ChainLlm, type Link, RedisRestStore, type RestStore } from "@/lib/ai/chain";
import { getRedis } from "@/lib/queue/films";
import { OpenAiCompatibleLlm } from "./llm";
import type { LlmProvider } from "./types";

// standard: Cloudflare Workers AI images + local pan-and-zoom, ~$0 per video.
// premium: fal.ai Nano Banana 2 images + Wan/Kling AI animation, paid with credits.
// cinematic: the same images + Kling 3.0 Pro or Veo 3.1, hyper-real at 1080p, paid with more credits.
export type Quality = "standard" | "premium" | "cinematic";

export function mediaStore(env: Env): LocalMediaStore {
  return new LocalMediaStore(path.resolve(env.OUTPUT_DIR, "media"));
}

export function premiumAvailable(env: Env): boolean {
  return Boolean(env.FAL_KEY);
}

export const cinematicAvailable = premiumAvailable;

export function buildPipelineDeps(env: Env, quality: Quality = "standard"): PipelineDeps {
  return {
    llm: buildLlm(env),
    image: buildImage(env, quality),
    video: quality === "standard" ? new KenBurnsVideo(mediaStore(env), defaultFfmpeg) : buildAiVideo(env, quality),
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
  if (quality !== "standard" && env.FAL_KEY) return new FalAceStep(new FalQueueClient(env.FAL_KEY));
  return undefined;
}

// AI singing for dance reels: the self-hosted ACE-Step when configured (as for music), else ACE-Step on fal.
export function danceSongAvailable(env: Env): boolean {
  return Boolean(env.ACESTEP_URL || env.FAL_KEY);
}

export function buildDanceSinger(env: Env): AceStepMusic | FalAceStep {
  return buildSongProvider(env);
}

// Song Studio runs on the free self-hosted ACE-Step when ACESTEP_URL is set, otherwise on fal.
export function songsAvailable(env: Env): boolean {
  return Boolean(env.ACESTEP_URL || env.FAL_KEY);
}

export function buildSongProvider(env: Env): AceStepMusic | FalAceStep {
  if (env.ACESTEP_URL) return new AceStepMusic(env.ACESTEP_URL);
  return new FalAceStep(new FalQueueClient(requireKey(env.FAL_KEY, "FAL_KEY")));
}

// Short songs (30 s) with Google Lyria 3 on fal; only fal has Lyria, so without FAL_KEY they use ACE-Step.
export function buildShortSongProvider(env: Env): AceStepMusic | FalLyria {
  if (!env.FAL_KEY) return buildSongProvider(env) as AceStepMusic;
  return new FalLyria(new FalQueueClient(env.FAL_KEY));
}

// Remix (cover, extend, replace a part): ACE-Step's edit endpoints on fal, like songs.
export function buildSongEditor(env: Env): AceStepMusic | FalSongEditor {
  if (env.ACESTEP_URL) return new AceStepMusic(env.ACESTEP_URL);
  return new FalSongEditor(new FalQueueClient(requireKey(env.FAL_KEY, "FAL_KEY")));
}

// Pro remixes (ACE-Step 1.5 on Runware) need Runware, plus fal for songs and stem separation.
export function proRemixAvailable(env: Env): boolean {
  return Boolean(env.RUNWARE_API_KEY && env.FAL_KEY);
}

export function buildProSongEditor(env: Env): RunwareSongEditor {
  return new RunwareSongEditor(requireKey(env.RUNWARE_API_KEY, "RUNWARE_API_KEY"));
}

// The Studio's stems: Demucs on fal, so they need fal even when songs are made locally.
export function stemsAvailable(env: Env): boolean {
  return Boolean(env.FAL_KEY);
}

export function buildStemSeparator(env: Env): FalDemucs {
  return new FalDemucs(new FalQueueClient(requireKey(env.FAL_KEY, "FAL_KEY")));
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
// Reelkar's own lane, on the owner's keys (never shown to creators), in the order it's tried:
// OpenRouter when set (paid mode), then the free Workers AI Llama, Gemini and Groq. Each one that
// runs out of free use rests until it resets, and the next one answers.
export function reelkarLane(env: Env, fetchFn: typeof fetch = fetch): Link<LlmProvider>[] {
  const links: Link<LlmProvider>[] = [];
  if (env.OPENROUTER_API_KEY) {
    const llm = new OpenAiCompatibleLlm("https://openrouter.ai/api/v1", env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL, { licenseId: "openrouter", jsonMode: true }, fetchFn);
    links.push({ id: "lane:openrouter", name: "Reelkar (OpenRouter)", engine: llm });
  }
  if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) {
    // Workers AI's OpenAI-compatible endpoint. Every call wants JSON, and without JSON mode the free
    // Llama sometimes sends broken JSON (an unquoted key, a stray quote), so it's on.
    const llm = new OpenAiCompatibleLlm(
      `${cloudflareAiBase(env.CLOUDFLARE_ACCOUNT_ID)}/v1`,
      env.CLOUDFLARE_API_TOKEN,
      env.CF_LLM_MODEL ?? CLOUDFLARE_DEFAULTS.llmModel,
      { licenseId: "llama-3.3-70b", jsonMode: true },
      fetchFn,
    );
    links.push({ id: "lane:cloudflare", name: "Reelkar (Workers AI)", engine: llm });
  }
  if (env.GEMINI_API_KEY) links.push({ id: "lane:gemini", name: "Reelkar (Gemini)", engine: geminiLlm(env.GEMINI_API_KEY, "gemini-2.5-flash", fetchFn) });
  if (env.GROQ_API_KEY) {
    const llm = new OpenAiCompatibleLlm("https://api.groq.com/openai/v1", env.GROQ_API_KEY, "llama-3.3-70b-versatile", { licenseId: "groq", jsonMode: true }, fetchFn);
    links.push({ id: "lane:groq", name: "Reelkar (Groq)", engine: llm });
  }
  if (!links.length) requireKey(undefined, "CLOUDFLARE_ACCOUNT_ID");
  return links;
}

// Rests are kept in Redis, so the web app and the worker skip the same tired engines.
export const aiRests: RestStore = new RedisRestStore(getRedis);

// The AI for tasks that aren't any one creator's: Reelkar's lane. Creators' own requests use
// llmForUser (src/lib/ai/engines.ts), which tries their engines first.
export function buildLlm(env: Env, rests: RestStore = aiRests): LlmProvider {
  return new ChainLlm(reelkarLane(env), rests);
}

// Gemini through its OpenAI-compatible endpoint. Flash models think by default, which spends the
// reply's token budget, so thinking is off for them.
export function geminiLlm(apiKey: string, model: string, fetchFn: typeof fetch = fetch): OpenAiCompatibleLlm {
  return new OpenAiCompatibleLlm("https://generativelanguage.googleapis.com/v1beta/openai", apiKey, model, {
    licenseId: model.startsWith("gemini-2.5-pro") ? "gemini-2.5-pro" : "gemini-2.5-flash",
    jsonMode: true,
    ...(model.includes("flash") ? { extraBody: { reasoning_effort: "none" } } : {}),
  }, fetchFn);
}

export function buildImage(env: Env, quality: Quality = "standard") {
  if (quality !== "standard") {
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

// "Sing it yourself" music videos: Kling AI Avatar standard for AI animation, pro for Cinematic.
export function buildSinger(env: Env, quality: "premium" | "cinematic"): FalAvatarSinger {
  const fal = new FalQueueClient(requireKey(env.FAL_KEY, "FAL_KEY"));
  return new FalAvatarSinger(fal, quality === "cinematic" ? DEFAULT_FAL_MODELS.avatarPro : DEFAULT_FAL_MODELS.avatar);
}

function buildAiVideo(env: Env, quality: "premium" | "cinematic") {
  const fal = new FalQueueClient(requireKey(env.FAL_KEY, "FAL_KEY"));
  if (quality === "cinematic") {
    return env.CINEMATIC_VIDEO_MODEL === "veo"
      ? new FalImageToVideo(fal, "veo-3.1", env.FAL_VEO_MODEL_ID ?? DEFAULT_FAL_MODELS.veo31)
      : new FalImageToVideo(fal, "kling-3.0", env.FAL_KLING3_MODEL_ID ?? DEFAULT_FAL_MODELS.kling3);
  }
  return env.VIDEO_MODEL === "kling"
    ? new FalImageToVideo(fal, "kling-2.6", env.FAL_KLING_MODEL_ID ?? DEFAULT_FAL_MODELS.kling)
    : new FalImageToVideo(fal, "wan-2.x", env.FAL_WAN_MODEL_ID ?? DEFAULT_FAL_MODELS.wan);
}
