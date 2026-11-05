// fal models for real music videos: the star sings (OmniHuman 1.5), dances (Kling 3 motion
// control) and acts out the lyrics (Kling 3 with the star bound as an element). Input schemas
// checked against fal's OpenAPI pages, and prices against fal's pricing API, on 2026-11-05.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Env, requireKey } from "@/lib/env";
import { readMedia } from "@/lib/media";
import { DEFAULT_FAL_MODELS, FalAvatarSinger, FalQueueClient } from "./fal";
import { FalDemucs } from "./voice";

export const MUSIC_VIDEO_FAL_MODELS = {
  // $0.16 per second of audio. Audio under 60 s at 720p (under 30 s at 1080p).
  omnihuman: "fal-ai/bytedance/omnihuman/v1.5",
  // $0.168/s. The reference clip sets the moves and the length: up to 30 s with
  // character_orientation "video", which is also the only mode that binds a face element.
  motion: "fal-ai/kling-video/v3/pro/motion-control",
  // $0.14/s, 3 to 15 s. `elements` keeps the same star in every scene (@Element1 in the prompt).
  kling3: DEFAULT_FAL_MODELS.kling3,
};

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

// fal can't fetch files on this server, so they go inline as data URIs.
export async function falUrl(url: string): Promise<string> {
  if (!url.startsWith("file://")) return url;
  const type = TYPES[path.extname(fileURLToPath(url)).toLowerCase()] ?? "application/octet-stream";
  return `data:${type};base64,${(await readMedia(url)).toString("base64")}`;
}

// Turns a local file into a URL fal can fetch. OmniHuman and motion control refuse data URIs
// ("Failed to download the file", "Video URL is invalid"), so the worker uploads to fal storage.
export type HostFile = (url: string) => Promise<string>;

export class FalStorage {
  constructor(
    private readonly key: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  readonly host: HostFile = async (url) => {
    if (!url.startsWith("file://")) return url;
    const file = fileURLToPath(url);
    const contentType = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    const init = await this.fetchFn("https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3", {
      method: "POST",
      headers: { Authorization: `Key ${this.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content_type: contentType, file_name: path.basename(file) }),
    });
    if (!init.ok) throw new Error(`fal storage ${init.status}: ${await init.text()}`);
    const { upload_url, file_url } = (await init.json()) as { upload_url: string; file_url: string };
    const put = await this.fetchFn(upload_url, { method: "PUT", headers: { "Content-Type": contentType }, body: new Uint8Array(await readMedia(url)) });
    if (!put.ok) throw new Error(`fal storage upload ${put.status}`);
    return file_url;
  };
}

export interface Singer {
  readonly modelId: string;
  sing(input: { imageUrl: string; audioUrl: string; prompt: string }): Promise<{ url: string }>;
}

export class FalOmniHuman implements Singer {
  readonly modelId = "omnihuman-1.5";

  constructor(
    private readonly client: FalQueueClient,
    private readonly hostFile: HostFile = falUrl,
  ) {}

  async sing(input: { imageUrl: string; audioUrl: string; prompt: string }): Promise<{ url: string }> {
    const out = await this.client.run<{ video: { url: string } }>(MUSIC_VIDEO_FAL_MODELS.omnihuman, {
      image_url: await this.hostFile(input.imageUrl),
      audio_url: await this.hostFile(input.audioUrl),
      prompt: input.prompt,
      // 720p is fal's recommendation: faster, better, and allows up to 60 s of audio.
      resolution: "720p",
    });
    return { url: out.video.url };
  }
}

// Kling AI Avatar takes over a singing shot when OmniHuman fails.
export class SingerWithFallback implements Singer {
  readonly modelId: string;

  constructor(
    private readonly main: Singer,
    private readonly fallback: Singer,
    private readonly hostFile: HostFile = falUrl,
  ) {
    this.modelId = main.modelId;
  }

  async sing(input: { imageUrl: string; audioUrl: string; prompt: string }): Promise<{ url: string }> {
    try {
      return await this.main.sing(input);
    } catch (err) {
      console.error(`${this.main.modelId} failed, singing with ${this.fallback.modelId}:`, (err as Error).message);
      return this.fallback.sing({ ...input, imageUrl: await this.hostFile(input.imageUrl), audioUrl: await this.hostFile(input.audioUrl) });
    }
  }
}

export interface Dancer {
  readonly modelId: string;
  // Copies the moves in the reference clip onto the star in the picture.
  dance(input: { imageUrl: string; referenceUrl: string; prompt: string; starUrl?: string }): Promise<{ url: string }>;
}

export class FalMotionControl implements Dancer {
  readonly modelId = "kling-3.0-motion";

  constructor(
    private readonly client: FalQueueClient,
    private readonly hostFile: HostFile = falUrl,
  ) {}

  async dance(input: { imageUrl: string; referenceUrl: string; prompt: string; starUrl?: string }): Promise<{ url: string }> {
    const star = input.starUrl ? await this.hostFile(input.starUrl) : undefined;
    const out = await this.client.run<{ video: { url: string } }>(MUSIC_VIDEO_FAL_MODELS.motion, {
      image_url: await this.hostFile(input.imageUrl),
      video_url: await this.hostFile(input.referenceUrl),
      // "video" follows the dancer's body (better for complex moves) and allows the face element.
      character_orientation: "video",
      keep_original_sound: false,
      prompt: star ? `${input.prompt}. The dancer is @Element1.` : input.prompt,
      ...(star ? { elements: [{ frontal_image_url: star, reference_image_urls: [star] }] } : {}),
    });
    return { url: out.video.url };
  }
}

export interface SceneAnimator {
  readonly modelId: string;
  animate(input: { imageUrl: string; prompt: string; durationSec: number; starUrl?: string }): Promise<{ url: string }>;
}

export class FalKling3Scene implements SceneAnimator {
  readonly modelId = "kling-3.0";

  constructor(
    private readonly client: FalQueueClient,
    private readonly hostFile: HostFile = falUrl,
  ) {}

  async animate(input: { imageUrl: string; prompt: string; durationSec: number; starUrl?: string }): Promise<{ url: string }> {
    const star = input.starUrl ? await this.hostFile(input.starUrl) : undefined;
    const out = await this.client.run<{ video: { url: string } }>(MUSIC_VIDEO_FAL_MODELS.kling3, {
      start_image_url: await this.hostFile(input.imageUrl),
      prompt: star ? `${input.prompt}. The lead character is @Element1.` : input.prompt,
      duration: String(Math.min(15, Math.max(3, Math.ceil(input.durationSec)))),
      // The song is the only sound; native audio would also double the price.
      generate_audio: false,
      ...(star ? { elements: [{ frontal_image_url: star, reference_image_urls: [star] }] } : {}),
    });
    return { url: out.video.url };
  }
}

export interface MusicVideoProviders {
  singer: Singer;
  dancer: Dancer;
  scenes: SceneAnimator;
  stems: { readonly modelId: string; separate(audioUrl: string): Promise<{ vocalsUrl: string; accompanimentUrls: string[] }> };
}

export function buildMusicVideoProviders(env: Env): MusicVideoProviders {
  const key = requireKey(env.FAL_KEY, "FAL_KEY");
  const fal = new FalQueueClient(key);
  const host = new FalStorage(key).host;
  return {
    singer: new SingerWithFallback(new FalOmniHuman(fal, host), new FalAvatarSinger(fal, DEFAULT_FAL_MODELS.avatar), host),
    dancer: new FalMotionControl(fal, host),
    scenes: new FalKling3Scene(fal, host),
    stems: new FalDemucs(fal),
  };
}
