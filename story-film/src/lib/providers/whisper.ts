import type { Word } from "@/lib/music-video/timing";
import { cloudflareAiBase } from "./cloudflare";

// Word timings from Whisper on Workers AI (~41 neurons per audio minute).
export class CloudflareWhisper {
  readonly modelId = "whisper";

  constructor(
    private readonly accountId: string,
    private readonly token: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async words(audio: Buffer): Promise<Word[]> {
    const data = await this.run(audio);
    return (data.words ?? []).map((w) => ({ start: w.start, end: w.end }));
  }

  async transcribe(audio: Buffer): Promise<string> {
    return (await this.run(audio)).text ?? "";
  }

  private async run(audio: Buffer): Promise<{ text?: string; words?: { start: number; end: number }[] }> {
    const res = await this.fetchFn(`${cloudflareAiBase(this.accountId)}/run/@cf/openai/whisper`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/octet-stream" },
      body: new Uint8Array(audio),
    });
    if (!res.ok) throw new Error(`Whisper ${res.status}: ${await res.text()}`);
    return ((await res.json()) as { result?: { text?: string; words?: { start: number; end: number }[] } }).result ?? {};
  }
}

export interface TimedWord {
  word: string;
  start: number;
  end: number;
}

export interface Transcript {
  text: string;
  language?: string;
  words: TimedWord[];
}

// Speech-to-text with word timings for a creator's own video (Whisper large-v3-turbo on
// Workers AI, ~$0.0005 per audio minute). Passing the language keeps Hindi in Devanagari.
export class CloudflareTranscriber {
  readonly modelId = "whisper";

  constructor(
    private readonly accountId: string,
    private readonly token: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async transcribe(audio: Buffer, language?: string): Promise<Transcript> {
    const res = await this.fetchFn(`${cloudflareAiBase(this.accountId)}/run/@cf/openai/whisper-large-v3-turbo`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ audio: audio.toString("base64"), ...(language ? { language } : {}), vad_filter: true, condition_on_previous_text: false }),
    });
    if (!res.ok) throw new Error(`Transcription ${res.status}: ${await res.text()}`);
    const r =
      ((await res.json()) as {
        result?: { text?: string; transcription_info?: { language?: string }; segments?: { words?: { word?: string; start?: number; end?: number }[] }[] };
      }).result ?? {};
    const words = (r.segments ?? [])
      .flatMap((s) => s.words ?? [])
      .filter((w) => w.word?.trim() && typeof w.start === "number" && typeof w.end === "number")
      .map((w) => ({ word: w.word!.trim(), start: w.start!, end: Math.max(w.end!, w.start!) }));
    return { text: r.text ?? "", language: r.transcription_info?.language ?? language, words };
  }
}
