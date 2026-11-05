import { randomUUID } from "node:crypto";
import { readMedia } from "@/lib/media";
import { AUDIO_TYPES, audioExt, fetchFalAudio, type SongAudio } from "./fal-music";

// ACE-Step 1.5 XL Base on Runware, from Runware's docs on 2026-11-05 (not yet tried live).
// fal only hosts 1.5 as text-to-music; its edit endpoints are the older v1 model. Runware has
// one task type ("audioInference") whose mode follows from the fields sent: input audio plus
// `strength` restyles a song (a cover), and a repainting window redoes a part, or adds to the
// end when the window runs past it. Runware has no lego/extract (add-a-track) field, so adding
// vocals or a backing is built on covers plus stem separation in `src/lib/songs/remix.ts`.
export const RUNWARE_API = "https://api.runware.ai/v1";
export const RUNWARE_ACE_STEP = "runware:ace-step@v1.5-xl-base";

// Runware's limits: repaint times run -300..300 s, the prompt is 2–3000 characters, lyrics 10–3000.
export const RUNWARE_MAX_SEC = 300;
const LYRICS_MIN = 10;

// How far a cover moves from the original, 0 (barely) to 1 (a new song on the same bones).
// Runware's `strength` is the opposite: the share of steps that follow the input audio.
// The ends are kept off so a cover always sounds like the song, and always changes something.
export const COVER_STRENGTH = { min: 0, max: 1, default: 0.5 };
const RUNWARE_STRENGTH = { min: 0.2, max: 0.9 };

export function runwareStrength(strength: number): number {
  const c = Math.min(COVER_STRENGTH.max, Math.max(COVER_STRENGTH.min, strength));
  return Number((RUNWARE_STRENGTH.max - c * (RUNWARE_STRENGTH.max - RUNWARE_STRENGTH.min)).toFixed(2));
}

export interface ProCoverInput {
  audioUrl: string;
  style: string;
  lyrics?: string;
  // 0–1, see COVER_STRENGTH.
  strength?: number;
}

export interface RepaintInput {
  audioUrl: string;
  style: string;
  lyrics?: string;
  // Seconds from the start; an end past the song's end adds new music after it.
  startSec: number;
  endSec: number;
}

interface RunwareTaskResult {
  taskType: string;
  taskUUID: string;
  status?: "processing" | "success" | "error";
  audioURL?: string;
  mediaUUID?: string;
  cost?: number;
}

interface RunwareResponse {
  data?: RunwareTaskResult[];
  errors?: { code?: string; message?: string; parameter?: string }[];
}

export class RunwareSongEditor {
  readonly modelId = "ace-step-1.5-runware";

  constructor(
    private readonly key: string,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly pollMs = 2000,
    private readonly timeoutMs = 10 * 60 * 1000,
    private readonly model = RUNWARE_ACE_STEP,
  ) {}

  async cover(input: ProCoverInput): Promise<SongAudio> {
    return this.infer({
      positivePrompt: input.style.slice(0, 3000),
      ...this.lyrics(input.lyrics),
      inputs: { audio: await this.audioRef(input.audioUrl) },
      strength: runwareStrength(input.strength ?? COVER_STRENGTH.default),
    });
  }

  async repaint(input: RepaintInput): Promise<SongAudio> {
    return this.infer({
      positivePrompt: input.style.slice(0, 3000),
      inputs: { audio: await this.audioRef(input.audioUrl) },
      settings: {
        ...this.lyrics(input.lyrics).settings,
        repaintingStart: Math.max(0, input.startSec),
        repaintingEnd: Math.min(RUNWARE_MAX_SEC, input.endSec),
      },
    });
  }

  private lyrics(lyrics?: string): { settings?: { lyrics: string } } {
    // Runware rejects lyrics under 10 characters; an instrumental sends none.
    return lyrics && lyrics.trim().length >= LYRICS_MIN ? { settings: { lyrics: lyrics.slice(0, 3000) } } : {};
  }

  // Submits one task asynchronously and polls until it's done, since sync calls give up after 120 s.
  private async infer(task: Record<string, unknown>): Promise<SongAudio> {
    const taskUUID = randomUUID();
    await this.post([{ taskType: "audioInference", taskUUID, model: this.model, outputType: "URL", outputFormat: "MP3", deliveryMethod: "async", includeCost: true, ...task }]);
    const deadline = Date.now() + this.timeoutMs;
    for (;;) {
      const result = (await this.post([{ taskType: "getResponse", taskUUID }])).find((r) => r.taskUUID === taskUUID);
      if (result?.status === "error") throw new Error(`Runware task ${taskUUID} failed`);
      if (result?.audioURL) return fetchFalAudio({ url: result.audioURL }, this.fetchFn, "mp3");
      if (Date.now() > deadline) throw new Error(`Runware task ${taskUUID} timed out`);
      await new Promise((r) => setTimeout(r, this.pollMs));
    }
  }

  // Runware can't reach local files, so they're uploaded to its media storage first and sent by id.
  private async audioRef(url: string): Promise<string> {
    if (!url.startsWith("file://")) return url;
    const data = await readMedia(url);
    const named = /\.(mp3|wav|flac|ogg)$/i.exec(url)?.[1].toLowerCase() ?? "wav";
    const taskUUID = randomUUID();
    const [stored] = await this.post([
      { taskType: "mediaStorage", taskUUID, operation: "upload", media: `data:${AUDIO_TYPES[audioExt(data, named)]};base64,${data.toString("base64")}` },
    ]);
    if (!stored?.mediaUUID) throw new Error("Runware didn't store the song");
    return stored.mediaUUID;
  }

  private async post(tasks: Record<string, unknown>[]): Promise<RunwareTaskResult[]> {
    const res = await this.fetchFn(RUNWARE_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
      body: JSON.stringify(tasks),
    });
    const body = (await res.json().catch(() => ({}))) as RunwareResponse;
    if (!res.ok || body.errors?.length) {
      const e = body.errors?.[0];
      throw new Error(`Runware ${res.status}: ${e ? `${e.code ?? "error"} ${e.message ?? ""}`.trim() : "request failed"}`);
    }
    return body.data ?? [];
  }
}
