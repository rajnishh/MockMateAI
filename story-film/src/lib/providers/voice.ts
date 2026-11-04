import type { FalQueueClient } from "./fal";

interface FalFile {
  url: string;
}

export interface Stems {
  vocalsUrl: string;
  accompanimentUrls: string[];
}

// Splits a song into vocals and backing stems with Demucs (MIT) on fal.ai.
export class FalDemucs {
  readonly modelId = "demucs";

  constructor(private readonly client: FalQueueClient) {}

  async separate(audioUrl: string): Promise<Stems> {
    const out = await this.client.run<Record<"vocals" | "drums" | "bass" | "other", FalFile | null>>("fal-ai/demucs", {
      audio_url: audioUrl,
      model: "htdemucs",
      stems: ["vocals", "drums", "bass", "other"],
      output_format: "wav",
    });
    if (!out.vocals) throw new Error("Couldn't find the vocals in this song");
    return {
      vocalsUrl: out.vocals.url,
      accompanimentUrls: [out.drums, out.bass, out.other].filter((f): f is FalFile => Boolean(f)).map((f) => f.url),
    };
  }
}

export interface VoiceConverter {
  readonly modelId: string;
  // Re-sings sourceUrl's vocals in the voice of the reference recording.
  convert(input: { sourceUrl: string; referenceDataUri: string }): Promise<{ url: string } | { data: Buffer }>;
}

// Chatterbox speech-to-speech (MIT) on fal.ai. Built for speech, so melody can
// drift on sung vocals; SeedVcServer is the higher-quality singing option.
export class FalChatterboxVc implements VoiceConverter {
  readonly modelId = "chatterbox";

  constructor(private readonly client: FalQueueClient) {}

  async convert(input: { sourceUrl: string; referenceDataUri: string }) {
    const out = await this.client.run<{ audio: FalFile }>("fal-ai/chatterbox/speech-to-speech", {
      source_audio_url: input.sourceUrl,
      target_voice_audio_url: input.referenceDataUri,
    });
    return { url: out.audio.url };
  }
}

// A self-hosted Seed-VC singing-voice service (GPL-3.0, so it runs as its own
// service and is never linked into this app). Expected contract:
// POST /convert {source_url, reference_audio_base64, f0_condition: true} -> audio/wav.
export class SeedVcServer implements VoiceConverter {
  readonly modelId = "seed-vc";

  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async convert(input: { sourceUrl: string; referenceDataUri: string }) {
    const res = await this.fetchFn(`${this.baseUrl}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_url: input.sourceUrl,
        reference_audio_base64: input.referenceDataUri.split(",")[1],
        // Keep the original melody; only the voice changes.
        f0_condition: true,
        auto_f0_adjust: true,
      }),
    });
    if (!res.ok) throw new Error(`Seed-VC ${res.status}: ${await res.text()}`);
    return { data: Buffer.from(await res.arrayBuffer()) };
  }
}
