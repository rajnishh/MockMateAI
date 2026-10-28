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
