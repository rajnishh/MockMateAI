import { describe, expect, it } from "vitest";
import { FalImageToVideo, FalQueueClient } from "@/lib/providers/fal";

function fakeFetch(responses: Record<string, unknown[]>) {
  const calls: { url: string; body?: string }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body as string | undefined });
    const next = responses[url].shift();
    return new Response(JSON.stringify(next), { status: 200 });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("fal queue client", () => {
  it("submits, polls until completed, and fetches the result", async () => {
    const { fn, calls } = fakeFetch({
      "https://queue.fal.run/fal-ai/kling": [{ request_id: "r1", status_url: "s", response_url: "o" }],
      s: [{ status: "IN_QUEUE" }, { status: "COMPLETED" }],
      o: [{ video: { url: "https://cdn/clip.mp4" } }],
    });
    const video = new FalImageToVideo(new FalQueueClient("k", fn, 0), "kling-2.6", "fal-ai/kling");
    const out = await video.animate({ imageUrl: "https://img", prompt: "pan", durationSec: 5, resolution: "720p" });
    expect(out.url).toBe("https://cdn/clip.mp4");
    expect(JSON.parse(calls[0].body!)).toMatchObject({ start_image_url: "https://img", duration: "5", generate_audio: false });
  });

  it("throws on a failed request", async () => {
    const { fn } = fakeFetch({
      "https://queue.fal.run/m": [{ request_id: "r1", status_url: "s", response_url: "o" }],
      s: [{ status: "FAILED" }],
    });
    await expect(new FalQueueClient("k", fn, 0).run("m", {})).rejects.toThrow(/FAILED/);
  });

  it("sends Wan its image and resolution", async () => {
    const { fn, calls } = fakeFetch({
      "https://queue.fal.run/fal-ai/wan": [{ request_id: "r1", status_url: "s", response_url: "o" }],
      s: [{ status: "COMPLETED" }],
      o: [{ video: { url: "https://cdn/w.mp4" } }],
    });
    await new FalImageToVideo(new FalQueueClient("k", fn, 0), "wan-2.x", "fal-ai/wan").animate({
      imageUrl: "https://img",
      prompt: "pan",
      durationSec: 5,
      resolution: "720p",
    });
    expect(JSON.parse(calls[0].body!)).toEqual({ prompt: "pan", duration: "5", image_url: "https://img", resolution: "720p" });
  });
});
