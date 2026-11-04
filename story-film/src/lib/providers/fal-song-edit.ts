import { readMedia } from "@/lib/media";
import type { FalQueueClient } from "./fal";
import type { SongAudio } from "./fal-music";

// ACE-Step (v1) edit endpoints on fal, checked against fal's OpenAPI schemas on 2026-11-05.
// All three need `tags` and `audio_url`; audio-to-audio also needs `original_tags`.
// None takes a strength or creativity knob, so covers keep fal's defaults.
export const FAL_ACE_STEP_EDIT = {
  cover: "fal-ai/ace-step/audio-to-audio",
  extend: "fal-ai/ace-step/audio-outpaint",
  replace: "fal-ai/ace-step/audio-inpaint",
};

// fal's limits: outpaint adds at most 107s on each side; inpaint times run 0–240s.
export const FAL_MAX_EXTEND_SEC = 107;
export const FAL_MAX_INPAINT_SEC = 240;

export interface CoverInput {
  audioUrl: string;
  // The new style, and the style the song was made in (fal needs both to restyle it).
  style: string;
  originalStyle: string;
  // New lyrics to sing; defaults to the original ones.
  lyrics?: string;
  originalLyrics: string;
}

export interface ExtendInput {
  audioUrl: string;
  style: string;
  lyrics?: string;
  extendBeforeSec: number;
  extendAfterSec: number;
}

export interface ReplaceSectionInput {
  audioUrl: string;
  startSec: number;
  endSec: number;
  style: string;
  lyrics?: string;
}

interface AceEditOutput {
  audio: { url: string; content_type?: string | null; file_name?: string | null };
}

function audioType(url: string): string {
  if (/\.mp3$/i.test(url)) return "audio/mpeg";
  if (/\.flac$/i.test(url)) return "audio/flac";
  if (/\.ogg$/i.test(url)) return "audio/ogg";
  return "audio/wav";
}

// Suno-style remixing: restyle a song, make it longer, or redo one part.
export class FalSongEditor {
  readonly modelId = "ace-step-edit";

  constructor(
    private readonly client: FalQueueClient,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly models = FAL_ACE_STEP_EDIT,
  ) {}

  async cover(input: CoverInput): Promise<SongAudio> {
    const out = await this.client.run<AceEditOutput>(this.models.cover, {
      audio_url: await this.audioRef(input.audioUrl),
      edit_mode: "remix",
      tags: input.style.slice(0, 512),
      original_tags: input.originalStyle.slice(0, 512),
      lyrics: input.lyrics ?? input.originalLyrics,
      original_lyrics: input.originalLyrics,
    });
    return this.fetchAudio(out);
  }

  async extend(input: ExtendInput): Promise<SongAudio> {
    const out = await this.client.run<AceEditOutput>(this.models.extend, {
      audio_url: await this.audioRef(input.audioUrl),
      tags: input.style.slice(0, 512),
      ...(input.lyrics !== undefined ? { lyrics: input.lyrics } : {}),
      extend_before_duration: Math.min(FAL_MAX_EXTEND_SEC, Math.max(0, input.extendBeforeSec)),
      extend_after_duration: Math.min(FAL_MAX_EXTEND_SEC, Math.max(0, input.extendAfterSec)),
    });
    return this.fetchAudio(out);
  }

  async replaceSection(input: ReplaceSectionInput): Promise<SongAudio> {
    const out = await this.client.run<AceEditOutput>(this.models.replace, {
      audio_url: await this.audioRef(input.audioUrl),
      tags: input.style.slice(0, 512),
      ...(input.lyrics !== undefined ? { lyrics: input.lyrics } : {}),
      start_time: input.startSec,
      start_time_relative_to: "start",
      end_time: input.endSec,
      end_time_relative_to: "start",
    });
    return this.fetchAudio(out);
  }

  // fal can't fetch local files, so locally stored songs are sent inline as data URIs.
  private async audioRef(url: string): Promise<string> {
    if (!url.startsWith("file://")) return url;
    return `data:${audioType(url)};base64,${(await readMedia(url)).toString("base64")}`;
  }

  private async fetchAudio(out: AceEditOutput): Promise<SongAudio> {
    const name = out.audio.file_name ?? new URL(out.audio.url).pathname;
    const ext = /\.(mp3|wav|flac|ogg)$/i.exec(name)?.[1].toLowerCase() ?? (out.audio.content_type?.includes("mpeg") ? "mp3" : "wav");
    return { data: await readMedia(out.audio.url, this.fetchFn), ext };
  }
}
