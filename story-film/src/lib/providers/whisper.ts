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
    const res = await this.fetchFn(`${cloudflareAiBase(this.accountId)}/run/@cf/openai/whisper`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/octet-stream" },
      body: new Uint8Array(audio),
    });
    if (!res.ok) throw new Error(`Whisper ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { result?: { words?: { start: number; end: number }[] } };
    return (data.result?.words ?? []).map((w) => ({ start: w.start, end: w.end }));
  }
}
