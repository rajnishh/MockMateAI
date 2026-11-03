import type { SongAudio, SongInput } from "./fal-music";
import type { MusicProvider } from "./types";

// ACE-Step ships no standard HTTP API, so the self-hosted server is expected
// to expose this contract: POST /generate {prompt, duration, instrumental, lyrics?, vocal_language?} -> audio/wav.
export class AceStepMusic implements MusicProvider {
  readonly modelId = "ace-step";

  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async compose(input: { prompt: string; durationSec: number }): Promise<Buffer> {
    const res = await this.fetchFn(`${this.baseUrl}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: input.prompt, duration: input.durationSec, instrumental: true }),
    });
    if (!res.ok) throw new Error(`ACE-Step ${res.status}: ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
  }

  // A song with vocals (dance reels' AI singing).
  async sing(input: SongInput): Promise<SongAudio> {
    const res = await this.fetchFn(`${this.baseUrl}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: input.style.slice(0, 512), duration: input.durationSec, instrumental: false, lyrics: input.lyrics, vocal_language: input.vocalLanguage }),
    });
    if (!res.ok) throw new Error(`ACE-Step ${res.status}: ${await res.text()}`);
    return { data: Buffer.from(await res.arrayBuffer()), ext: "wav" };
  }
}
