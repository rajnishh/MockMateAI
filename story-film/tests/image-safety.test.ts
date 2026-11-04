import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { creatorMessage, SAFETY_BLOCKED_MESSAGE } from "@/lib/creator-errors";
import { LocalMediaStore } from "@/lib/media";
import { type PipelineDeps, runFilm } from "@/lib/pipeline/orchestrator";
import { buildScriptPrompt } from "@/lib/pipeline/script";
import { CloudflareFluxImage } from "@/lib/providers/cloudflare";
import { FalNanoBanana, FalQueueClient } from "@/lib/providers/fal";
import {
  cleanImagePrompt,
  fillBlockedFrames,
  generateKeyframeSafely,
  ImageSafetyError,
  saferImagePrompt,
} from "@/lib/providers/safety";
import type { ImageProvider } from "@/lib/providers/types";

const dir = mkdtempSync(path.join(tmpdir(), "image-safety-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// The error from the creator's bug report, verbatim.
const CF_NSFW =
  '{"errors":[{"message":"AiError: AiError: Input prompt contains NSFW content. (4d51f75f-b403-4176-8148-82c37f888d72)","code":8007}],"success":false,"result":{},"messages":[]}';

// Refuses any prompt in `blocked` (or every prompt), like an over-eager filter.
function fakeImage(blocked: (prompt: string) => boolean) {
  const calls: string[] = [];
  const image: ImageProvider = {
    modelId: "flux-1-schnell",
    generateKeyframe: async ({ prompt }) => {
      calls.push(prompt);
      if (blocked(prompt)) throw new ImageSafetyError(`Cloudflare AI 400: ${CF_NSFW}`);
      return { url: `https://img/${calls.length}` };
    },
  };
  return { image, calls };
}

function fakeDeps(image: ImageProvider, shots: string[]) {
  const animated: string[] = [];
  const deps: PipelineDeps = {
    llm: {
      modelId: "llama-3.3-70b",
      completeJson: async () => ({}),
      writeScript: async () => ({
        title: "Morning Routine Hacks",
        language: "en",
        characters: [],
        shots: shots.map((imagePrompt, i) => ({ narration: `line ${i}`, imagePrompt, motionPrompt: "pan" })),
        musicPrompt: "calm",
      }),
    },
    image,
    video: {
      modelId: "ken-burns-ffmpeg",
      animate: async ({ imageUrl }) => {
        animated.push(imageUrl);
        return { url: "https://cdn/clip.mp4" };
      },
    },
    tts: { modelId: "kokoro-82m", speak: async () => Buffer.from("wav") },
    fetchFn: (async () => new Response("mp4")) as unknown as typeof fetch,
    runFfmpeg: async () => {},
  };
  return { deps, animated };
}

const request = { story: "x".repeat(30), style: "cinematic" as const, durationSec: 15, resolution: "480p" as const, watermark: true, referenceImageUrls: [], captions: false };

describe("Cloudflare and fal safety refusals", () => {
  it("Cloudflare code 8007 becomes an ImageSafetyError; other 400s don't", async () => {
    const media = new LocalMediaStore(path.join(dir, "media"));
    const nsfw = new CloudflareFluxImage("acct", "token", media, undefined, (async () => new Response(CF_NSFW, { status: 400 })) as unknown as typeof fetch);
    await expect(nsfw.generateKeyframe({ prompt: "p", referenceImageUrls: [] })).rejects.toBeInstanceOf(ImageSafetyError);

    const bad = new CloudflareFluxImage("acct", "token", media, undefined, (async () =>
      new Response('{"errors":[{"message":"bad input","code":5006}]}', { status: 400 })) as unknown as typeof fetch);
    const err = await bad.generateKeyframe({ prompt: "p", referenceImageUrls: [] }).catch((e) => e);
    expect(err).not.toBeInstanceOf(ImageSafetyError);
    expect(err.message).toMatch(/^Cloudflare AI 400/);
  });

  it("fal content_policy_violation becomes an ImageSafetyError", async () => {
    const fetchFn = (async (url: string) => {
      if (url.endsWith("/status")) return Response.json({ status: "COMPLETED" });
      if (url.endsWith("/response")) {
        return Response.json({ detail: [{ type: "content_policy_violation", msg: "flagged" }] }, { status: 422 });
      }
      return Response.json({ request_id: "r1", status_url: "https://q/r1/status", response_url: "https://q/r1/response" });
    }) as unknown as typeof fetch;
    const fal = new FalNanoBanana(new FalQueueClient("key", fetchFn, 0));
    await expect(fal.generateKeyframe({ prompt: "p", referenceImageUrls: [] })).rejects.toBeInstanceOf(ImageSafetyError);
  });
});

describe("safer prompts", () => {
  it("swaps trigger words but keeps the scene", () => {
    expect(cleanImagePrompt("A toddler in the bathtub with a rubber duck, Pixar style")).toBe(
      "A little child in the wash basin with a rubber duck, Pixar style",
    );
    expect(cleanImagePrompt("a young adult stretching in bed, cinematic")).toBe("an adult stretching in a cozy room, cinematic");
    // Ordinary words that merely contain a trigger stay put.
    expect(cleanImagePrompt("a flower bed by the bathroom window, embrace the day")).toBe("a flower bed by the bathroom window, embrace the day");
  });

  it("adds a family-friendly cue once", () => {
    const once = saferImagePrompt("a boy planning his day");
    expect(once).toContain("fully clothed");
    expect(saferImagePrompt(once)).toBe(once);
  });

  it("kid-safe script rules steer prompts away from trigger words", () => {
    const prompt = buildScriptPrompt({ story: "bath time song", style: "cinematic", shotCount: 3, kidSafe: true });
    expect(prompt).toContain("fully clothed");
    expect(buildScriptPrompt({ story: "x", style: "cinematic", shotCount: 3 })).not.toContain("fully clothed");
  });
});

describe("generateKeyframeSafely", () => {
  it("retries a blocked prompt once with the safer rewrite", async () => {
    let n = 0;
    const { image, calls } = fakeImage(() => n++ === 0);
    expect(await generateKeyframeSafely(image, { prompt: "planning out their day", referenceImageUrls: [] }, () => {})).toEqual({ url: "https://img/2" });
    expect(calls).toEqual(["planning out their day", saferImagePrompt("planning out their day")]);
  });

  it("returns null when the retry is blocked too, and rethrows other errors", async () => {
    const logs: string[] = [];
    const { image } = fakeImage(() => true);
    expect(await generateKeyframeSafely(image, { prompt: "p", referenceImageUrls: [] }, (m) => logs.push(m))).toBeNull();
    expect(logs).toHaveLength(2);

    const broken: ImageProvider = { modelId: "x", generateKeyframe: async () => { throw new Error("Cloudflare AI 500: down"); } };
    await expect(generateKeyframeSafely(broken, { prompt: "p", referenceImageUrls: [] })).rejects.toThrow("Cloudflare AI 500");
  });

  it("fills blocked shots from their neighbours", () => {
    expect(fillBlockedFrames([null, "a", null, "b", null])).toEqual(["a", "a", "a", "b", "b"]);
    expect(() => fillBlockedFrames([null, null])).toThrow(ImageSafetyError);
  });
});

describe("runFilm when the image filter refuses prompts", () => {
  it("finishes using the safer retry for a rejected first prompt", async () => {
    let n = 0;
    const { image, calls } = fakeImage(() => n++ === 0);
    const { deps, animated } = fakeDeps(image, ["wake up", "stretch", "plan the day"]);
    const { title } = await runFilm(deps, request, path.join(dir, "retry"));
    expect(title).toBe("Morning Routine Hacks");
    expect(calls[1]).toBe(saferImagePrompt("wake up"));
    expect(animated).toHaveLength(3);
  });

  it("reuses the previous picture when one shot is blocked twice", async () => {
    const { image } = fakeImage((p) => p.startsWith("plan"));
    const { deps, animated } = fakeDeps(image, ["wake up", "plan the day", "eat"]);
    await runFilm(deps, request, path.join(dir, "skip"));
    expect(animated).toHaveLength(3);
    expect(animated[1]).toBe(animated[0]);
  });

  it("cleans kid-safe prompts before asking for pictures", async () => {
    const { image, calls } = fakeImage(() => false);
    const { deps } = fakeDeps(image, ["a toddler at bath time", "a baby in bed", "naptime"]);
    await runFilm(deps, { ...request, kidSafe: true }, path.join(dir, "kids"));
    expect(calls).toEqual(["a little child at splash time", "a little child in a cozy room", "naptime"]);
    const saved = JSON.parse(readFileSync(path.join(dir, "kids", "script.json"), "utf8"));
    expect(saved.shots[0].imagePrompt).toBe(calls[0]);
  });

  it("fails with a plain message when every picture is blocked", async () => {
    const { image } = fakeImage(() => true);
    const { deps } = fakeDeps(image, ["wake up", "plan the day", "eat"]);
    const err = await runFilm(deps, request, path.join(dir, "all-blocked")).catch((e) => e);
    expect(err).toBeInstanceOf(ImageSafetyError);
    expect(creatorMessage(err)).toBe(SAFETY_BLOCKED_MESSAGE);
  });
});

describe("creatorMessage", () => {
  it("turns the bug report's raw Cloudflare JSON into a plain sentence", () => {
    expect(creatorMessage(new Error(`Cloudflare AI 400: ${CF_NSFW}`))).toBe(SAFETY_BLOCKED_MESSAGE);
  });

  it("maps other provider errors and keeps our own messages", () => {
    expect(creatorMessage(new Error("Cloudflare AI 429: slow down"))).toMatch(/busy/);
    expect(creatorMessage(new Error('Cloudflare AI 400: {"errors":[{"code":4006}]}'))).toMatch(/busy/);
    expect(creatorMessage(new Error("fal 401 for https://q: nope"))).toMatch(/couldn't reach/);
    expect(creatorMessage(new Error("Kokoro 500: boom"))).toMatch(/had a problem/);
    expect(creatorMessage(new Error("LLM reply was cut off at 4096 tokens"))).toMatch(/garbled/);
    expect(creatorMessage(z.object({ a: z.string() }).safeParse({}).error)).toMatch(/garbled/);
    expect(creatorMessage(new Error("Narration in Tamil isn't available on this server yet"))).toBe(
      "Narration in Tamil isn't available on this server yet",
    );
  });
});
