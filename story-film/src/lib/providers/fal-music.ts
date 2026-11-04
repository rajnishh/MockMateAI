import { findLanguage } from "@/lib/languages";
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

// Google Lyria 3 on fal: a 30-second song, $0.04 each (checked 2026-11-05). It has no lyrics field, so
// the lyrics go in the prompt; in a Hindi test it sang them almost word for word.
export const FAL_LYRIA = "fal-ai/lyria3";
export const LYRIA_SEC = 30;

export function lyriaPrompt(input: SongInput): string {
  const language = findLanguage(input.vocalLanguage)?.name;
  const sung = language ? `A song sung in ${language}` : "A song";
  return `${input.style}. ${sung}, with exactly these lyrics in this order (section tags in brackets are not sung):\n${input.lyrics}`.slice(0, 5000);
}

export class FalLyria {
  readonly modelId = "lyria-3";

  constructor(
    private readonly client: FalQueueClient,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async sing(input: SongInput): Promise<SongAudio> {
    const out = await this.client.run<AceOutput>(FAL_LYRIA, { prompt: lyriaPrompt(input) });
    const name = out.audio.file_name ?? new URL(out.audio.url).pathname;
    const ext = /\.(mp3|wav|flac|ogg)$/i.exec(name)?.[1].toLowerCase() ?? "mp3";
    return { data: await readMedia(out.audio.url, this.fetchFn), ext };
  }
}
