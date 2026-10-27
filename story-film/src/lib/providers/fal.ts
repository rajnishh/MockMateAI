import type { ImageProvider, Resolution, VideoProvider } from "./types";

// Default fal.ai model IDs, checked against fal's OpenAPI schemas on 2026-10-27.
export const DEFAULT_FAL_MODELS = {
  image: "fal-ai/nano-banana-2",
  imageEdit: "fal-ai/nano-banana-2/edit",
  wan: "fal-ai/wan-25-preview/image-to-video",
  kling: "fal-ai/kling-video/v2.6/pro/image-to-video",
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

export class FalNanoBanana implements ImageProvider {
  readonly modelId = "nano-banana-2";

  constructor(
    private readonly client: FalQueueClient,
    private readonly textModelId = DEFAULT_FAL_MODELS.image,
    private readonly editModelId = DEFAULT_FAL_MODELS.imageEdit,
  ) {}

  // With reference images the edit endpoint keeps character identity;
  // without them it falls back to plain text-to-image.
  async generateKeyframe(input: { prompt: string; referenceImageUrls: string[] }): Promise<{ url: string }> {
    const hasRefs = input.referenceImageUrls.length > 0;
    const out = await this.client.run<{ images: { url: string }[] }>(hasRefs ? this.editModelId : this.textModelId, {
      prompt: input.prompt,
      ...(hasRefs ? { image_urls: input.referenceImageUrls } : {}),
      aspect_ratio: "9:16",
      num_images: 1,
    });
    return { url: out.images[0].url };
  }
}

export class FalImageToVideo implements VideoProvider {
  constructor(
    private readonly client: FalQueueClient,
    readonly modelId: "wan-2.x" | "kling-2.6",
    private readonly falModelId: string,
  ) {}

  async animate(input: { imageUrl: string; prompt: string; durationSec: number; resolution: Resolution }): Promise<{ url: string }> {
    const payload: Record<string, unknown> = { prompt: input.prompt, duration: String(input.durationSec) };
    if (this.modelId === "wan-2.x") {
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
