import type { LocalMediaStore } from "@/lib/media";
import type { ImageProvider } from "./types";

export const CLOUDFLARE_DEFAULTS = {
  imageModel: "@cf/black-forest-labs/flux-1-schnell",
  llmModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
};

export function cloudflareAiBase(accountId: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai`;
}

// Free-mode images: FLUX.1 [schnell] on Workers AI (10k free neurons/day,
// ~60 neurons per image). Text-only, so consistency comes from the fixed
// character description and seed rather than reference images.
export class CloudflareFluxImage implements ImageProvider {
  readonly modelId = "flux-1-schnell";

  constructor(
    private readonly accountId: string,
    private readonly token: string,
    private readonly media: LocalMediaStore,
    private readonly model = CLOUDFLARE_DEFAULTS.imageModel,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async generateKeyframe(input: { prompt: string; referenceImageUrls: string[]; seed?: number }): Promise<{ url: string }> {
    const res = await this.fetchFn(`${cloudflareAiBase(this.accountId)}/run/${this.model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: `${input.prompt}, vertical composition, subject centered`.slice(0, 2048),
        steps: 8,
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Cloudflare AI ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { result: { image: string } };
    return { url: await this.media.put(Buffer.from(data.result.image, "base64"), "jpg") };
  }
}
