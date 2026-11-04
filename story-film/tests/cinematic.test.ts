import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { CINEMATIC_CREDITS_PER_SHOT, PREMIUM_CREDITS_PER_SHOT } from "@/lib/billing/catalog";
import { photoType, photoUrl, savePhoto } from "@/lib/photos";
import { PHOTO_LIKENESS, type PipelineDeps, runFilm } from "@/lib/pipeline/orchestrator";
import { FalImageToVideo, FalQueueClient } from "@/lib/providers/fal";
import { estimateCostUsd } from "@/lib/quota/plans";
import { paidCredits, parseFilmRequest, resolvePhoto, StartError } from "@/lib/start-film";

const dir = mkdtempSync(path.join(tmpdir(), "cinematic-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const story = "A young chef in Kochi cooks for her grandmother's birthday.";

function fakeFal() {
  const bodies: Record<string, unknown>[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      bodies.push(JSON.parse(init.body as string));
      return Response.json({ request_id: "r", status_url: "s", response_url: "o" });
    }
    return Response.json(url === "s" ? { status: "COMPLETED" } : { video: { url: "https://cdn/c.mp4" } });
  }) as unknown as typeof fetch;
  return { client: new FalQueueClient("k", fn, 0), bodies };
}

describe("Cinematic video models", () => {
  it("asks Kling 3.0 for a 5s clip without its paid audio", async () => {
    const { client, bodies } = fakeFal();
    await new FalImageToVideo(client, "kling-3.0", "m").animate({ imageUrl: "https://img", prompt: "dolly in", durationSec: 5, resolution: "1080p" });
    expect(bodies[0]).toEqual({ prompt: "dolly in", duration: "5", start_image_url: "https://img", generate_audio: false });
  });

  it("asks Veo 3.1 for a vertical 1080p 6s clip without audio, trimmed to 5s later", async () => {
    const { client, bodies } = fakeFal();
    await new FalImageToVideo(client, "veo-3.1", "m").animate({ imageUrl: "https://img", prompt: "dolly in", durationSec: 5, resolution: "1080p" });
    expect(bodies[0]).toEqual({ prompt: "dolly in", duration: "6s", image_url: "https://img", aspect_ratio: "9:16", resolution: "1080p", generate_audio: false });
  });

  it("charges more per shot than AI animation and still covers the API cost", () => {
    const body = { story, durationSec: 30, quality: "cinematic" };
    expect(paidCredits(parseFilmRequest("u1", body))).toBe(6 * CINEMATIC_CREDITS_PER_SHOT.kling);
    expect(paidCredits(parseFilmRequest("u1", body), "veo")).toBe(6 * CINEMATIC_CREDITS_PER_SHOT.veo);
    expect(CINEMATIC_CREDITS_PER_SHOT.kling).toBeGreaterThan(PREMIUM_CREDITS_PER_SHOT);
    // A credit is worth at least ₹3.1 after GST; at ₹88 to the dollar each shot keeps a margin of 25% or more.
    // fal's prices per second, audio off: Kling 3.0 Pro bills the 5s it makes, Veo 3.1 a 6s clip.
    // Plus a ~$0.08 Nano Banana keyframe per shot.
    const shotUsd = { kling: 5 * 0.112 + 0.08, veo: 6 * 0.2 + 0.08 };
    for (const model of ["kling", "veo"] as const) {
      expect(CINEMATIC_CREDITS_PER_SHOT[model] * 3.1).toBeGreaterThan(shotUsd[model] * 88 * 1.25);
    }
    expect(estimateCostUsd("kling-3.0", "1080p", 30)).toBeCloseTo(6 * (5 * 0.112 + 0.08) + 0.2, 2);
  });
});

describe("photos in reel requests", () => {
  it("only takes server-made photo ids and public picture links", () => {
    expect(() => parseFilmRequest("u1", { story, durationSec: 30, photo: "../../.env" })).toThrow(StartError);
    expect(() => parseFilmRequest("u1", { story, durationSec: 30, referenceImageUrls: ["file:///etc/passwd"] })).toThrow(StartError);
    expect(() => parseFilmRequest("u1", { story, durationSec: 30, referenceImageUrls: ["http://169.254.169.254/x"] })).toThrow(StartError);
    expect(parseFilmRequest("u1", { story, durationSec: 30, referenceImageUrls: ["https://cdn/x.jpg"] }).referenceImageUrls).toEqual(["https://cdn/x.jpg"]);
  });

  it("recognises photos by their bytes, not their name", () => {
    expect(photoType(JPEG)).toBe("jpg");
    expect(photoType(Buffer.from("89504e470d0a1a0a0000", "hex"))).toBe("png");
    expect(photoType(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("webp");
    expect(photoType(Buffer.from("<svg onload=alert(1)>"))).toBeUndefined();
  });

  it("lets a reel use only its creator's own photo, with consent and a paid quality", async () => {
    const id = await savePhoto(dir, "alice", JPEG);
    expect(id).toMatch(/\.jpg$/);
    expect(await savePhoto(dir, "alice", Buffer.from("not a photo"))).toBeUndefined();
    const job = { userId: "alice", photo: id!, photoConsent: true, quality: "cinematic" as const };
    expect(await resolvePhoto(job, dir)).toBe(await photoUrl(dir, "alice", id!));
    await expect(resolvePhoto({ ...job, userId: "mallory" }, dir)).rejects.toThrow("Upload your photo again.");
    await expect(resolvePhoto({ ...job, photoConsent: false }, dir)).rejects.toThrow(/agreed/);
    await expect(resolvePhoto({ ...job, quality: "standard" }, dir)).rejects.toThrow(/AI animation or Cinematic/);
    expect(await resolvePhoto({ ...job, photo: undefined }, dir)).toBeUndefined();
  });

  it("puts the photo first in every picture and asks for the person's likeness", async () => {
    const calls: { prompt: string; refs: string[] }[] = [];
    const deps: PipelineDeps = {
      llm: {
        modelId: "llama-3.3-70b",
        writeScript: async ({ shotCount }: { shotCount: number }) => ({
          title: "Birthday",
          language: "en",
          characters: [],
          shots: Array.from({ length: shotCount }, (_, i) => ({ narration: "hi", imagePrompt: `shot ${i}`, motionPrompt: "m" })),
          musicPrompt: "calm",
        }),
      } as unknown as PipelineDeps["llm"],
      image: {
        modelId: "nano-banana-2",
        generateKeyframe: async ({ prompt, referenceImageUrls }) => {
          calls.push({ prompt, refs: referenceImageUrls });
          return { url: `https://img/${calls.length}` };
        },
      },
      // Stops the reel once the pictures are made; this test only checks them.
      video: { modelId: "kling-3.0", animate: async () => Promise.reject(new Error("stop")) },
      tts: { modelId: "kokoro-82m", speak: async () => Buffer.alloc(0) },
    };
    const req = { story, style: "cinematic" as const, durationSec: 10, resolution: "1080p" as const, watermark: false, referenceImageUrls: [], photoUrl: "file:///p/me.jpg" };
    await expect(runFilm(deps, req, path.join(dir, "film"))).rejects.toThrow("stop");
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.refs[0]).toBe("file:///p/me.jpg");
      expect(c.prompt).toContain(PHOTO_LIKENESS);
    }
  });
});

describe("the visible AI label and Reelkar mark", () => {
  it("are the creator's choice, and the file still says it's AI-made", async () => {
    const { buildAssembleArgs } = await import("@/lib/pipeline/assemble");
    const base = { clips: ["a.mp4"], narration: ["a.wav"], clipSeconds: 5, resolution: "1080p" as const, output: "o.mp4" };
    const args = (watermark: boolean, aiLabel?: boolean) => buildAssembleArgs({ ...base, watermark, aiLabel }).join(" ");
    expect(args(false, false)).not.toContain("drawtext");
    expect(args(false, false)).toContain("comment=Created with AI");
    expect(args(false)).toContain("drawtext=text='Created with AI'");
    expect(args(true, false)).toContain("drawtext=text='Made with Reelkar · free plan'");
    expect(args(true)).toContain("Created with AI · Made with Reelkar · free plan");
  });
});
