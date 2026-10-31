import { readMedia } from "@/lib/media";
import type { FalQueueClient } from "./fal";
import type { MusicProvider } from "./types";

// Checked against fal's OpenAPI schema on 2026-10-28.
export const FAL_ACE_STEP = "fal-ai/ace-step-1.5";

export interface SongInput {
  style: string;
  lyrics: string;
  durationSec: number;
  // ISO code ("hi", "en") or "unknown" for auto-detect.
  vocalLanguage: string;
}

export interface SongAudio {
  data: Buffer;
  ext: string;
}

interface AceOutput {
  audio: { url: string; content_type?: string; file_name?: string };
}

// ACE-Step 1.5 on fal: full songs with vocals, and instrumental beds for videos.
export class FalAceStep implements MusicProvider {
  readonly modelId = "ace-step-1.5";

  constructor(
    private readonly client: FalQueueClient,
    private readonly falModelId = FAL_ACE_STEP,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async sing(input: SongInput): Promise<SongAudio> {
    const out = await this.client.run<AceOutput>(this.falModelId, {
      prompt: input.style.slice(0, 512),
      lyrics: input.lyrics,
      duration: input.durationSec,
      vocal_language: input.vocalLanguage,
    });
    return this.fetchAudio(out);
  }

  // Background music for videos (MusicProvider).
  async compose(input: { prompt: string; durationSec: number }): Promise<Buffer> {
    const out = await this.client.run<AceOutput>(this.falModelId, {
      prompt: input.prompt.slice(0, 512),
      lyrics: "[Instrumental]",
      duration: input.durationSec,
    });
    return (await this.fetchAudio(out)).data;
  }

  private async fetchAudio(out: AceOutput): Promise<SongAudio> {
    const name = out.audio.file_name ?? new URL(out.audio.url).pathname;
    const ext = /\.(mp3|wav|flac|ogg)$/i.exec(name)?.[1].toLowerCase() ?? (out.audio.content_type?.includes("mpeg") ? "mp3" : "wav");
    return { data: await readMedia(out.audio.url, this.fetchFn), ext };
  }
}
