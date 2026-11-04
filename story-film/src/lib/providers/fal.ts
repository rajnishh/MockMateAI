import { readMedia } from "@/lib/media";
import { ImageSafetyError } from "./safety";
import type { ImageProvider, Resolution, VideoProvider } from "./types";

// Default fal.ai model IDs, checked against fal's OpenAPI schemas on 2026-10-27.
export const DEFAULT_FAL_MODELS = {
  image: "fal-ai/nano-banana-2",
  imageEdit: "fal-ai/nano-banana-2/edit",
  wan: "fal-ai/wan-25-preview/image-to-video",
  kling: "fal-ai/kling-video/v2.6/pro/image-to-video",
  // Cinematic quality, checked against fal's OpenAPI schemas on 2026-11-04.
  kling3: "fal-ai/kling-video/v3/pro/image-to-video",
  veo31: "fal-ai/veo3.1/image-to-video",
  // "Sing it yourself" music videos: a picture lip-syncs to a stretch of the song.
  avatar: "fal-ai/kling-video/ai-avatar/v2/standard",
  avatarPro: "fal-ai/kling-video/ai-avatar/v2/pro",
};

const QUEUE_BASE = "https://queue.fal.run";

interface QueueSubmit {
  request_id: string;
  status_url: string;
  response_url: string;
}

export class FalQueueClient {
  constructor(
    private readonly key: string,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly pollMs = 3000,
    private readonly timeoutMs = 10 * 60 * 1000,
  ) {}

  async run<T>(modelId: string, input: Record<string, unknown>): Promise<T> {
    const submit = await this.request<QueueSubmit>(`${QUEUE_BASE}/${modelId}`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    const deadline = Date.now() + this.timeoutMs;
    for (;;) {
      const status = await this.request<{ status: string }>(submit.status_url);
      if (status.status === "COMPLETED") break;
      if (status.status !== "IN_QUEUE" && status.status !== "IN_PROGRESS") {
        throw new Error(`fal ${modelId} request ${submit.request_id} ended with status ${status.status}`);
      }
      if (Date.now() > deadline) throw new Error(`fal ${modelId} request ${submit.request_id} timed out`);
      await new Promise((r) => setTimeout(r, this.pollMs));
    }
    return this.request<T>(submit.response_url);
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchFn(url, {
      ...init,
      headers: { Authorization: `Key ${this.key}`, "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`fal ${res.status} for ${url}: ${await res.text()}`);
    return (await res.json()) as T;
  }
}

function imageType(url: string): string {
  if (url.endsWith(".png")) return "image/png";
  if (url.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export class FalNanoBanana implements ImageProvider {
  readonly modelId = "nano-banana-2";

  constructor(
    private readonly client: FalQueueClient,
    private readonly textModelId = DEFAULT_FAL_MODELS.image,
    private readonly editModelId = DEFAULT_FAL_MODELS.imageEdit,
  ) {}

  // With reference images the edit endpoint keeps character identity;
  // without them it falls back to plain text-to-image.
  async generateKeyframe(input: { prompt: string; referenceImageUrls: string[]; seed?: number }): Promise<{ url: string }> {
    // fal can't fetch local files, so locally stored references (e.g. a character
    // drawn in standard quality) are sent inline as data URIs.
    const refs = await Promise.all(
      input.referenceImageUrls.map(async (u) =>
        u.startsWith("file://") ? `data:${imageType(u)};base64,${(await readMedia(u)).toString("base64")}` : u,
      ),
    );
    const hasRefs = refs.length > 0;
    let out: { images?: { url: string }[] };
    try {
      out = await this.client.run(hasRefs ? this.editModelId : this.textModelId, {
        prompt: input.prompt,
        ...(hasRefs ? { image_urls: refs } : {}),
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
        aspect_ratio: "9:16",
        num_images: 1,
      });
    } catch (err) {
      // fal reports a refused prompt as a 422 with type content_policy_violation.
      if (/content_policy_violation/.test((err as Error).message)) throw new ImageSafetyError((err as Error).message);
      throw err;
    }
    // Nano Banana sometimes returns no image instead of an error when its filter trips.
    if (!out.images?.[0]?.url) throw new ImageSafetyError("fal returned no image");
    return { url: out.images[0].url };
  }
}

// Kling AI Avatar v2: makes the person in a picture sing or speak the given audio. The video is as
// long as the audio.
export class FalAvatarSinger {
  readonly modelId = "kling-avatar-2";

  constructor(
    private readonly client: FalQueueClient,
    private readonly falModelId: string,
  ) {}

  async sing(input: { imageUrl: string; audioUrl: string; prompt: string }): Promise<{ url: string }> {
    const out = await this.client.run<{ video: { url: string } }>(this.falModelId, {
      image_url: input.imageUrl,
      audio_url: input.audioUrl,
      prompt: input.prompt,
    });
    return { url: out.video.url };
  }
}

export class FalImageToVideo implements VideoProvider {
  constructor(
    private readonly client: FalQueueClient,
    readonly modelId: "wan-2.x" | "kling-2.6" | "kling-3.0" | "veo-3.1",
    private readonly falModelId: string,
  ) {}

  async animate(input: { imageUrl: string; prompt: string; durationSec: number; resolution: Resolution }): Promise<{ url: string }> {
    // Wan and Kling 2.6 only take 5 or 10 seconds; longer than needed is trimmed in assembly.
    const payload: Record<string, unknown> = { prompt: input.prompt, duration: input.durationSec > 5 ? "10" : "5" };
    if (this.modelId === "veo-3.1") {
      // Veo takes 4, 6 or 8 seconds. Its native audio doubles the price, and narration and music
      // are added in assembly; 1080p costs the same as 720p.
      payload.image_url = input.imageUrl;
      payload.duration = input.durationSec > 6 ? "8s" : input.durationSec > 4 ? "6s" : "4s";
      payload.aspect_ratio = "9:16";
      payload.resolution = "1080p";
      payload.generate_audio = false;
    } else if (this.modelId === "kling-3.0") {
      // Kling 3.0 takes any whole number of seconds from 3 to 15.
      payload.start_image_url = input.imageUrl;
      payload.duration = String(Math.min(15, Math.max(3, Math.ceil(input.durationSec))));
      payload.generate_audio = false;
    } else if (this.modelId === "wan-2.x") {
      payload.image_url = input.imageUrl;
      // Wan defaults to 1080p, which costs 1.5x the 720p rate.
      payload.resolution = input.resolution;
    } else {
      payload.start_image_url = input.imageUrl;
      // Kling defaults to native audio, which doubles its price; narration and music are added in assembly.
      payload.generate_audio = false;
    }
    const out = await this.client.run<{ video: { url: string } }>(this.falModelId, payload);
    return { url: out.video.url };
  }
}
