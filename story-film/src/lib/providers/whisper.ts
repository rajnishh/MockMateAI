import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { Word } from "@/lib/music-video/timing";
import { cloudflareAiBase } from "./cloudflare";

const execFileAsync = promisify(execFile);

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
export class CloudflareTranscriber implements Transcriber {
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

export interface Transcriber {
  readonly modelId: string;
  transcribe(audio: Buffer, language?: string): Promise<Transcript>;
}

type Exec = (file: string, args: string[]) => Promise<unknown>;

// whisper.cpp on the owner's own computer: never runs out, about real time on an M-series Mac.
// One-word segments (-ml 1 -sow) give word timings like Workers AI's.
export class LocalWhisper implements Transcriber {
  readonly modelId = "whisper";

  constructor(
    private readonly model: string,
    private readonly bin = "whisper-cli",
    private readonly exec: Exec = (file, args) => execFileAsync(file, args, { maxBuffer: 16 * 1024 * 1024, timeout: 300_000 }),
  ) {}

  async transcribe(audio: Buffer, language?: string): Promise<Transcript> {
    const dir = await mkdtemp(path.join(tmpdir(), "reelkar-whisper-"));
    try {
      const wav = path.join(dir, "in.wav");
      await writeFile(wav, audio);
      await this.exec(this.bin, ["-m", this.model, "-f", wav, "-l", language ?? "auto", "-ml", "1", "-sow", "-oj", "-of", path.join(dir, "out"), "-np"]);
      const out = JSON.parse(await readFile(path.join(dir, "out.json"), "utf8")) as {
        result?: { language?: string };
        transcription?: { text?: string; offsets?: { from?: number; to?: number } }[];
      };
      const segments = out.transcription ?? [];
      const words = segments
        .filter((s) => s.text?.trim() && typeof s.offsets?.from === "number" && typeof s.offsets?.to === "number")
        .map((s) => ({ word: s.text!.trim(), start: s.offsets!.from! / 1000, end: Math.max(s.offsets!.to!, s.offsets!.from!) / 1000 }));
      const text = segments.map((s) => s.text ?? "").join("").trim();
      return { text, language: out.result?.language ?? language, words };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

const LANGUAGE_NAMES: Record<string, string> = { hi: "Hindi", en: "English", ar: "Arabic", bn: "Bengali", ta: "Tamil", te: "Telugu", mr: "Marathi", gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi", ur: "Urdu" };

// Gemini listens too, but gives no word timings, so it's only for tasks that need just the words.
export class GeminiTranscriber implements Transcriber {
  readonly modelId = "gemini";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async transcribe(audio: Buffer, language?: string): Promise<Transcript> {
    const lang = language ? LANGUAGE_NAMES[language] ?? language : undefined;
    const prompt = [
      "Write down the words sung or spoken in this recording, exactly as heard, in their own script (Hindi in Devanagari).",
      lang ? `The language is ${lang}.` : "",
      "Reply with only the words. If there are no words (humming, music or silence), reply with nothing.",
    ].filter(Boolean).join(" ");
    const res = await this.fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ inline_data: { mime_type: "audio/wav", data: audio.toString("base64") } }, { text: prompt }] }] }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
    const text = (data.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
    return { text, language, words: [] };
  }
}
