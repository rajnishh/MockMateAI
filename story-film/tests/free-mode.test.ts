import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { createCharacter, referenceSheetPrompt } from "@/lib/characters";
import { LocalMediaStore, publicMediaUrl, readMedia } from "@/lib/media";
import { defaultFfmpeg } from "@/lib/pipeline/orchestrator";
import { CloudflareFluxImage } from "@/lib/providers/cloudflare";
import { KenBurnsVideo } from "@/lib/providers/kenburns";
import { OpenAiCompatibleLlm } from "@/lib/providers/llm";
import { suggestIdeas } from "@/lib/suggestions";

const dir = mkdtempSync(path.join(tmpdir(), "free-mode-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const media = new LocalMediaStore(path.join(dir, "media"));

describe("Cloudflare FLUX image provider", () => {
  it("sends prompt and seed and stores the returned image locally", async () => {
    const sent: { url: string; body: Record<string, unknown> }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(init.body as string) });
      return new Response(JSON.stringify({ result: { image: Buffer.from("jpeg-bytes").toString("base64") }, success: true }));
    }) as unknown as typeof fetch;
    const image = new CloudflareFluxImage("acct", "tok", media, undefined, fetchFn);

    const { url } = await image.generateKeyframe({ prompt: "a fox", referenceImageUrls: [], seed: 42 });

    expect(sent[0].url).toBe("https://api.cloudflare.com/client/v4/accounts/acct/ai/run/@cf/black-forest-labs/flux-1-schnell");
    expect(sent[0].body).toMatchObject({ seed: 42, steps: 8 });
    expect(url.startsWith("file://")).toBe(true);
    expect((await readMedia(url)).toString()).toBe("jpeg-bytes");
    expect(publicMediaUrl(url)).toMatch(/^\/api\/media\/[0-9a-f-]{36}\.jpg$/);
  });
});

describe("characters", () => {
  it("generates a reference sheet with a fixed seed", async () => {
    let seenSeed: number | undefined;
    const image = {
      modelId: "flux-1-schnell",
      generateKeyframe: async (i: { seed?: number }) => {
        seenSeed = i.seed;
        return { url: "file:///ref.jpg" };
      },
    };
    const c = await createCharacter(image, { name: "Mia", description: "toddler with a curly bun", style: "animated" });
    expect(c.seed).toBe(seenSeed);
    expect(c.referenceImageUrl).toBe("file:///ref.jpg");
    expect(referenceSheetPrompt(c)).toContain("full body character reference");
  });
});

describe("AI suggestions", () => {
  it("parses ideas from an OpenAI-compatible endpoint", async () => {
    let body: Record<string, unknown> = {};
    const fetchFn = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      const content = '```json\n{"ideas":[{"title":"Rainy day colours","idea":"Mia finds colours in puddles."}]}\n```';
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
    }) as unknown as typeof fetch;
    const llm = new OpenAiCompatibleLlm("https://x/v1", "k", "@cf/model", { licenseId: "llama-3.3-70b", jsonMode: false }, fetchFn);

    const ideas = await suggestIdeas(llm, { niche: "kids learning", kidSafe: true });

    expect(ideas[0].title).toBe("Rainy day colours");
    expect(body.model).toBe("@cf/model");
    expect(body).not.toHaveProperty("response_format");
  });
});

describe("Ken Burns video", () => {
  it("turns a still into a 5s 9:16 clip", async () => {
    const still = path.join(dir, "still.png");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=1024x1024", "-frames:v", "1", still]);
    const video = new KenBurnsVideo(media, defaultFfmpeg);

    const { url } = await video.animate({ imageUrl: `file://${still}`, prompt: "slow zoom", durationSec: 5, resolution: "480p" });

    const probe = execFileSync("ffprobe", [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height:format=duration", "-of", "default=nw=1", fileURLToPath(url),
    ]).toString();
    expect(probe).toContain("width=480");
    expect(probe).toContain("height=854");
    expect(Number(probe.match(/duration=([\d.]+)/)![1])).toBeCloseTo(5, 0);
  }, 60_000);
});
