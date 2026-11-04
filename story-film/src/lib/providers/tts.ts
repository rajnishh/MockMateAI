import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { defaultFfmpeg } from "@/lib/ffmpeg";
import { findLanguage } from "@/lib/languages";
import { readMedia } from "@/lib/media";
import { assertCommercialSafe } from "@/lib/models/licenses";
import type { FalQueueClient } from "./fal";
import type { TtsProvider } from "./types";

// Sarvam Bulbul: Indian languages (bn, mr, ta, te, plus hi/en). Paid API,
// about ₹1 per 10,000 characters on bulbul:v4-flash.
export class SarvamTts implements TtsProvider {
  readonly modelId = "sarvam-bulbul";

  constructor(
    private readonly apiKey: string,
    private readonly model = "bulbul:v4-flash",
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async speak(input: { text: string; language: string }): Promise<Buffer> {
    const res = await this.fetchFn("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: { "api-subscription-key": this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: input.text.slice(0, 2500),
        language_code: `${input.language}-IN`,
        model: this.model,
        speech_sample_rate: 24000,
        output_audio_codec: "wav",
      }),
    });
    if (!res.ok) throw new Error(`Sarvam TTS ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { audios: string[] };
    return Buffer.from(data.audios.join(""), "base64");
  }
}

const CHATTERBOX_LANGUAGE: Record<string, string> = { ar: "arabic", en: "english", hi: "hindi" };
const CHATTERBOX_MAX = 300;

// Splits text into pieces under the model's limit, breaking at spaces.
export function splitForTts(text: string, max: number): string[] {
  const pieces: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const cut = rest.lastIndexOf(" ", max);
    const at = cut > 0 ? cut : max;
    pieces.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

// Chatterbox Multilingual (MIT) on fal.ai: used for Arabic. 300 characters per call.
export class FalChatterboxTts implements TtsProvider {
  readonly modelId = "chatterbox-multilingual";

  constructor(
    private readonly client: FalQueueClient,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly runFfmpeg: (args: string[]) => Promise<void> = defaultFfmpeg,
  ) {}

  async speak(input: { text: string; language: string }): Promise<Buffer> {
    const voice = CHATTERBOX_LANGUAGE[input.language];
    if (!voice) throw new Error(`No Chatterbox voice for language "${input.language}"`);
    const parts = await Promise.all(
      splitForTts(input.text, CHATTERBOX_MAX).map(async (text) => {
        const out = await this.client.run<{ audio: { url: string } }>("fal-ai/chatterbox/text-to-speech/multilingual", { text, voice });
        return readMedia(out.audio.url, this.fetchFn);
      }),
    );
    return parts.length === 1 ? parts[0] : this.concat(parts);
  }

  private async concat(parts: Buffer[]): Promise<Buffer> {
    const dir = await mkdtemp(path.join(tmpdir(), "tts-"));
    try {
      const files = await Promise.all(parts.map(async (p, i) => {
        const f = path.join(dir, `${i}.wav`);
        await writeFile(f, p);
        return f;
      }));
      const out = path.join(dir, "out.wav");
      await this.runFfmpeg([
        "-y", "-loglevel", "error",
        ...files.flatMap((f) => ["-i", f]),
        "-filter_complex", `${files.map((_, i) => `[${i}:a]`).join("")}concat=n=${files.length}:v=0:a=1[a]`,
        "-map", "[a]", out,
      ]);
      return readFile(out);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

// LLMs sometimes answer "ta-IN" or "TA" for the language code.
function normaliseCode(code: string): string {
  return code.trim().slice(0, 2).toLowerCase();
}

// Picks the engine for each language from src/lib/languages.ts. Engines that
// aren't configured are left out, and asking for their languages fails clearly.
export class RoutedTts implements TtsProvider {
  readonly modelId = "routed-tts";

  constructor(private readonly engines: Partial<Record<"kokoro" | "sarvam" | "chatterbox", TtsProvider>>) {
    for (const e of Object.values(engines)) if (e) assertCommercialSafe(e.modelId);
  }

  supports(language: string): boolean {
    const lang = findLanguage(normaliseCode(language));
    return Boolean(lang && this.engines[lang.tts]);
  }

  async speak(input: { text: string; language: string }): Promise<Buffer> {
    const lang = findLanguage(normaliseCode(input.language));
    const engine = lang && this.engines[lang.tts];
    if (!engine) throw new Error(`Narration in ${lang?.name ?? input.language} isn't available on this server yet`);
    return engine.speak({ ...input, language: lang.code });
  }
}
