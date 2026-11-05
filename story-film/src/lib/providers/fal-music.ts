import { findLanguage } from "@/lib/languages";
import { readMedia } from "@/lib/media";
import { type AceControls, aceInputs, controlWords } from "@/lib/songs/controls";
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
  // Song Studio's dials: Experiment, Follow my style, BPM and key. Missing on older jobs.
  controls?: AceControls;
}

export interface SongAudio {
  data: Buffer;
  ext: string;
}

// What an audio file really is, from its first bytes: fal names ACE-Step's FLAC output ".wav"
// (checked 2026-11-05), and sending it on labelled as WAV makes fal's edit endpoints fail with a 500.
export function audioExt(data: Buffer, fallback: string): string {
  const head = data.subarray(0, 12).toString("latin1");
  if (head.startsWith("fLaC")) return "flac";
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WAVE") return "wav";
  if (head.startsWith("OggS")) return "ogg";
  if (head.startsWith("ID3") || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0)) return "mp3";
  return fallback;
}

export const AUDIO_TYPES: Record<string, string> = { mp3: "audio/mpeg", wav: "audio/wav", flac: "audio/flac", ogg: "audio/ogg" };

// Downloads fal's output and names it by its contents.
export async function fetchFalAudio(audio: { url: string; content_type?: string | null; file_name?: string | null }, fetchFn: typeof fetch, fallback: string): Promise<SongAudio> {
  const name = audio.file_name ?? new URL(audio.url).pathname;
  const named = /\.(mp3|wav|flac|ogg)$/i.exec(name)?.[1].toLowerCase() ?? fallback;
  const data = await readMedia(audio.url, fetchFn);
  return { data, ext: audioExt(data, named) };
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
      ...aceInputs(input.controls),
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

  private fetchAudio(out: AceOutput): Promise<SongAudio> {
    return fetchFalAudio(out.audio, this.fetchFn, out.audio.content_type?.includes("mpeg") ? "mp3" : "wav");
  }
}

// Google Lyria 3 on fal: a 30-second song, $0.04 each (checked 2026-11-05). It has no lyrics field, so
// the lyrics go in the prompt; in a Hindi test it sang them almost word for word.
export const FAL_LYRIA = "fal-ai/lyria3";
export const LYRIA_SEC = 30;

export function lyriaPrompt(input: SongInput): string {
  const dials = controlWords(input.controls);
  const style = dials ? `${input.style}, ${dials}` : input.style;
  if (input.lyrics.trim() === "[Instrumental]") return `${style}. Instrumental only, no vocals.`.slice(0, 5000);
  const language = findLanguage(input.vocalLanguage)?.name;
  const sung = language ? `A song sung in ${language}` : "A song";
  return `${style}. ${sung}, with exactly these lyrics in this order (section tags in brackets are not sung):\n${input.lyrics}`.slice(0, 5000);
}

export class FalLyria {
  readonly modelId = "lyria-3";

  constructor(
    private readonly client: FalQueueClient,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async sing(input: SongInput): Promise<SongAudio> {
    const out = await this.client.run<AceOutput>(FAL_LYRIA, { prompt: lyriaPrompt(input) });
    return fetchFalAudio(out.audio, this.fetchFn, "mp3");
  }
}
