import type { TtsProvider } from "./types";

// Kokoro v1.0 voices by language. Arabic is not covered by Kokoro; it needs
// NAMAA Saudi TTS or Chatterbox Multilingual (Phase 1).
export const KOKORO_VOICES: Record<string, string> = {
  en: "af_heart",
  hi: "hf_alpha",
  es: "ef_dora",
  fr: "ff_siwis",
  it: "if_sara",
  pt: "pf_dora",
  ja: "jf_alpha",
  zh: "zf_xiaobei",
};

// Talks to Kokoro-FastAPI's OpenAI-compatible speech endpoint.
export class KokoroTts implements TtsProvider {
  readonly modelId = "kokoro-82m";

  constructor(
    private readonly baseUrl: string,
    private readonly defaultVoice: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  voiceFor(language: string): string {
    if (language === "en") return this.defaultVoice;
    const voice = KOKORO_VOICES[language];
    if (!voice) throw new Error(`Kokoro has no voice for language "${language}"`);
    return voice;
  }

  async speak(input: { text: string; language: string }): Promise<Buffer> {
    const res = await this.fetchFn(`${this.baseUrl}/v1/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "kokoro",
        input: input.text,
        voice: this.voiceFor(input.language),
        response_format: "wav",
      }),
    });
    if (!res.ok) throw new Error(`Kokoro ${res.status}: ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
  }
}
