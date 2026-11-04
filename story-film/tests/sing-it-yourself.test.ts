import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { CINEMATIC_CREDITS_PER_SHOT, musicVideoCredits, PREMIUM_CREDITS_PER_SHOT, SINGER_CREDITS_PER_SHOT } from "@/lib/billing/catalog";
import { runMusicVideo, SINGER_SHOT } from "@/lib/music-video/pipeline";
import { PHOTO_LIKENESS } from "@/lib/pipeline/orchestrator";
import { FalAvatarSinger, FalQueueClient } from "@/lib/providers/fal";
import { probeDuration } from "@/lib/ffmpeg";

const dir = mkdtempSync(path.join(tmpdir(), "sing-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const LYRICS = "[Verse]\nबारिश की बूँदें गिरें\nदादी की रसोई महके\n\n[Chorus]\nयादों के गीत\nदादी का प्यार";

describe("music video prices", () => {
  it("charges per 5 seconds of song by quality, and more when the star sings it", () => {
    expect(musicVideoCredits("standard", 60)).toBe(2);
    expect(musicVideoCredits("premium", 60)).toBe(12 * PREMIUM_CREDITS_PER_SHOT);
    expect(musicVideoCredits("cinematic", 60)).toBe(12 * CINEMATIC_CREDITS_PER_SHOT.kling);
    expect(musicVideoCredits("cinematic", 60, { cinematicModel: "veo" })).toBe(12 * CINEMATIC_CREDITS_PER_SHOT.veo);
    expect(musicVideoCredits("premium", 61, { singer: true })).toBe(13 * SINGER_CREDITS_PER_SHOT.premium);
    expect(musicVideoCredits("cinematic", 60, { singer: true })).toBe(12 * SINGER_CREDITS_PER_SHOT.cinematic);
    // Kling AI Avatar: $0.0562/s standard and $0.115/s pro, plus a $0.08 keyframe, per 5s; a credit is
    // worth at least ₹3.1, so each keeps a margin of 25% or more at ₹88 to the dollar.
    expect(SINGER_CREDITS_PER_SHOT.premium * 3.1).toBeGreaterThan((5 * 0.0562 + 0.08) * 88 * 1.25);
    expect(SINGER_CREDITS_PER_SHOT.cinematic * 3.1).toBeGreaterThan((5 * 0.115 + 0.08) * 88 * 1.25);
  });
});

describe("sing it yourself", () => {
  it("sends Kling AI Avatar the picture, the audio and the prompt", async () => {
    const bodies: unknown[] = [];
    const fn = (async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        bodies.push(JSON.parse(init.body as string));
        return Response.json({ request_id: "r", status_url: "s", response_url: "o" });
      }
      return Response.json(url === "s" ? { status: "COMPLETED" } : { video: { url: "https://cdn/sing.mp4" }, duration: 4 });
    }) as unknown as typeof fetch;
    const out = await new FalAvatarSinger(new FalQueueClient("k", fn, 0), "m").sing({ imageUrl: "https://img", audioUrl: "data:audio/mpeg;base64,AA", prompt: "sings" });
    expect(out.url).toBe("https://cdn/sing.mp4");
    expect(bodies[0]).toEqual({ image_url: "https://img", audio_url: "data:audio/mpeg;base64,AA", prompt: "sings" });
  });

  it("lip-syncs every scene to its own stretch of the song, starring the photo", async () => {
    const song = path.join(dir, "song.wav");
    const still = path.join(dir, "still.png");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=330:duration=20", song]);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=720x720", "-frames:v", "1", still]);
    const keyframes: { prompt: string; refs: string[] }[] = [];
    const sung: { seconds: number; prompt: string }[] = [];
    let animated = 0;

    const result = await runMusicVideo(
      {
        llm: {
          modelId: "llama-3.3-70b",
          writeScript: async () => { throw new Error(); },
          completeJson: async (p: string) => {
            expect(p).toContain(SINGER_SHOT);
            const n = Number(/Return exactly (\d+) scenes/.exec(p)![1]);
            return { scenes: Array.from({ length: n }, (_, i) => ({ imagePrompt: `scene ${i}`, motionPrompt: "sway" })) };
          },
        },
        image: {
          modelId: "nano-banana-2",
          generateKeyframe: async ({ prompt, referenceImageUrls }) => {
            keyframes.push({ prompt, refs: referenceImageUrls });
            return { url: `file://${still}` };
          },
        },
        video: { modelId: "kling-3.0", animate: async () => (animated++, { url: "unused" }) },
        // Stands in for Kling AI Avatar: a clip exactly as long as the audio it was given.
        singer: {
          modelId: "kling-avatar-2",
          sing: async ({ audioUrl, prompt }) => {
            const i = sung.length;
            const audio = path.join(dir, `got-${i}.mp3`);
            writeFileSync(audio, Buffer.from(audioUrl.replace(/^data:audio\/mpeg;base64,/, ""), "base64"));
            const seconds = await probeDuration(audio);
            sung.push({ seconds, prompt });
            const clip = path.join(dir, `sing-out-${i}.mp4`);
            execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc=size=720x1280:rate=24:duration=${seconds}`, "-pix_fmt", "yuv420p", clip]);
            return { url: `file://${clip}` };
          },
        },
      },
      {
        songFile: song,
        title: "Dadi",
        lyrics: LYRICS,
        genre: "Pop",
        mood: "",
        style: "photoreal",
        resolution: "480p",
        watermark: false,
        sceneSec: { min: 3, max: 5 },
        photoUrl: "file:///p/me.jpg",
        singer: true,
      },
      path.join(dir, "job"),
    );

    expect(animated).toBe(0);
    expect(sung.length).toBeGreaterThanOrEqual(4);
    expect(sung.reduce((a, s) => a + s.seconds, 0)).toBeCloseTo(20, 0);
    for (const s of sung) expect(s.prompt).toContain(SINGER_SHOT);
    for (const k of keyframes) {
      expect(k.refs[0]).toBe("file:///p/me.jpg");
      expect(k.prompt).toContain(PHOTO_LIKENESS);
    }
    expect(await probeDuration(result.output)).toBeCloseTo(20, 0);
  }, 120_000);

  it("refuses to start a singing video when no singer is set up", async () => {
    const deps = { llm: {}, image: {}, video: {} } as unknown as Parameters<typeof runMusicVideo>[0];
    const req = { songFile: "x", title: "t", lyrics: "", genre: "", mood: "", style: "animated" as const, resolution: "480p" as const, watermark: false, sceneSec: { min: 3, max: 5 }, singer: true };
    await expect(runMusicVideo(deps, req, path.join(dir, "none"))).rejects.toThrow(/Lip-synced/);
  });
});
