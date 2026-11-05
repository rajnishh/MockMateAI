import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { LYRIC_VIDEO_CREDITS, MUSIC_VIDEO_CREDITS_PER_5S, musicVideoKindCredits } from "@/lib/billing/catalog";
import { probeDuration } from "@/lib/ffmpeg";
import { LocalMediaStore } from "@/lib/media";
import { loadStoryboard, type MusicVideoDeps, type MusicVideoRequest, runMusicVideo, SINGER_SHOT } from "@/lib/music-video/pipeline";
import { defaultFfmpeg, PHOTO_LIKENESS } from "@/lib/pipeline/orchestrator";
import { FalQueueClient } from "@/lib/providers/fal";
import { FalKling3Scene, FalMotionControl, FalOmniHuman, type Singer, SingerWithFallback } from "@/lib/providers/fal-music-video";
import { KenBurnsVideo } from "@/lib/providers/kenburns";
import { musicVideoKind, musicVideoRequestSchema } from "@/lib/queue/films";

const dir = mkdtempSync(path.join(tmpdir(), "mvk-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const LYRICS = "[Verse]\nबारिश की बूँदें गिरें\nदादी की रसोई महके\n\n[Chorus]\nयादों के गीत\nदादी का प्यार\nचाय के साथ\nएक शाम";

describe("music video prices", () => {
  it("charges a flat price for lyric videos and per 5 seconds for the AI kinds", () => {
    expect(musicVideoKindCredits("lyric", 120)).toBe(LYRIC_VIDEO_CREDITS);
    expect(musicVideoKindCredits("story", 30)).toBe(6 * MUSIC_VIDEO_CREDITS_PER_5S.story);
    expect(musicVideoKindCredits("performance", 31)).toBe(7 * MUSIC_VIDEO_CREDITS_PER_5S.performance);
    expect(musicVideoKindCredits("full", 12)).toBe(3 * MUSIC_VIDEO_CREDITS_PER_5S.full);
    // fal prices on 2026-11-05 per 5 s of song (with a $0.08 keyframe each 5 s and the star
    // picture spread in); a credit is worth at least ₹3.1, so each keeps a 30% margin at ₹88 a dollar.
    const rupees = (usd: number) => usd * 88 * 1.3;
    expect(MUSIC_VIDEO_CREDITS_PER_5S.story * 3.1).toBeGreaterThan(rupees(5 * 0.14 + 0.08));
    expect(MUSIC_VIDEO_CREDITS_PER_5S.performance * 3.1).toBeGreaterThan(rupees(5 * 0.16 + 0.08 + 5 * 0.0007));
    expect(MUSIC_VIDEO_CREDITS_PER_5S.full * 3.1).toBeGreaterThan(rupees(5 * (0.4 * 0.16 + 0.25 * 0.168 + 0.35 * 0.14) + 0.1 + 0.03));
  });

  it("maps older clients' quality and singer onto the new kinds", () => {
    const parse = (b: object) => musicVideoKind(musicVideoRequestSchema.parse(b));
    expect(parse({})).toBe("lyric");
    expect(parse({ quality: "premium" })).toBe("story");
    expect(parse({ quality: "cinematic", singer: true })).toBe("performance");
    expect(parse({ kind: "full" })).toBe("full");
    expect(musicVideoRequestSchema.safeParse({ range: { start: 10, end: 11 } }).success).toBe(false);
  });
});

function fakeFal() {
  const bodies: { model: string; body: Record<string, unknown> }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      bodies.push({ model: url.replace("https://queue.fal.run/", ""), body: JSON.parse(init.body as string) });
      return Response.json({ request_id: "r", status_url: "s", response_url: "o" });
    }
    return Response.json(url === "s" ? { status: "COMPLETED" } : { video: { url: "https://cdn/out.mp4" } });
  }) as unknown as typeof fetch;
  return { bodies, client: new FalQueueClient("k", fn, 0) };
}

describe("fal music video models", () => {
  it("sends OmniHuman the picture and the vocal stem at 720p", async () => {
    const { bodies, client } = fakeFal();
    await new FalOmniHuman(client).sing({ imageUrl: "https://img", audioUrl: "https://vocals.mp3", prompt: "sings" });
    expect(bodies[0]).toEqual({
      model: "fal-ai/bytedance/omnihuman/v1.5",
      body: { image_url: "https://img", audio_url: "https://vocals.mp3", prompt: "sings", resolution: "720p" },
    });
  });

  it("copies the reference dance onto the star, binding the star's face", async () => {
    const { bodies, client } = fakeFal();
    const ref = path.join(dir, "ref.mp4");
    writeFileSync(ref, Buffer.from("video"));
    await new FalMotionControl(client).dance({ imageUrl: "https://frame", referenceUrl: `file://${ref}`, prompt: "bhangra", starUrl: "https://star" });
    const { model, body } = bodies[0];
    expect(model).toBe("fal-ai/kling-video/v3/pro/motion-control");
    expect(body.video_url).toBe(`data:video/mp4;base64,${Buffer.from("video").toString("base64")}`);
    expect(body.character_orientation).toBe("video");
    expect(body.keep_original_sound).toBe(false);
    expect(body.elements).toEqual([{ frontal_image_url: "https://star", reference_image_urls: ["https://star"] }]);
    expect(body.prompt).toContain("@Element1");
  });

  it("animates story scenes with Kling 3, the star as an element and no native audio", async () => {
    const { bodies, client } = fakeFal();
    await new FalKling3Scene(client).animate({ imageUrl: "https://frame", prompt: "walks", durationSec: 3.4, starUrl: "https://star" });
    expect(bodies[0].body).toMatchObject({ start_image_url: "https://frame", duration: "4", generate_audio: false, elements: [{ frontal_image_url: "https://star" }] });
    await new FalKling3Scene(client).animate({ imageUrl: "https://frame", prompt: "walks", durationSec: 1.5 });
    expect(bodies[1].body.duration).toBe("3");
    expect(bodies[1].body.elements).toBeUndefined();
  });

  it("falls back to Kling AI Avatar when OmniHuman fails", async () => {
    const failing: Singer = { modelId: "omnihuman-1.5", sing: async () => { throw new Error("fal 500"); } };
    const used: string[] = [];
    const avatar: Singer = { modelId: "kling-avatar-2", sing: async (i) => (used.push(i.imageUrl), { url: "https://avatar.mp4" }) };
    expect(await new SingerWithFallback(failing, avatar).sing({ imageUrl: "https://img", audioUrl: "https://a", prompt: "p" })).toEqual({ url: "https://avatar.mp4" });
    expect(used).toEqual(["https://img"]);
  });
});

// A fake model clip as long as asked (or as the audio it was given).
function clip(name: string, seconds: number): string {
  const file = path.join(dir, `${name}.mp4`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc=size=720x1280:rate=24:duration=${seconds}`, "-pix_fmt", "yuv420p", file]);
  return `file://${file}`;
}

describe("full music video", () => {
  it("sings, dances and acts out the song, cut on the beat, from a checked storyboard", async () => {
    const song = path.join(dir, "song.wav");
    const still = path.join(dir, "still.png");
    // 24 s of 120 BPM clicks, so the beat is clear.
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "aevalsrc='0.8*sin(2*PI*600*t)*exp(-40*mod(t,0.5))':d=24:s=44100", song]);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=720x720", "-frames:v", "1", still]);
    const assets = path.join(dir, "assets");
    execFileSync("mkdir", ["-p", path.join(assets, "dance")]);
    clip("assets/dance/bhangra", 5);

    const keyframes: { prompt: string; refs: string[] }[] = [];
    const sung: { seconds: number; prompt: string }[] = [];
    const danced: { refSeconds: number; prompt: string; star?: string }[] = [];
    const scenes: { seconds: number; star?: string }[] = [];
    let separated = 0;
    const deps: MusicVideoDeps = {
      llm: {
        modelId: "llama-3.3-70b",
        writeScript: async () => { throw new Error(); },
        completeJson: async (p: string) => {
          const n = Number(/Return exactly (\d+) shots/.exec(p)![1]);
          return { star: "a young singer in a red kurta", shots: Array.from({ length: n }, (_, i) => ({ imagePrompt: `place ${i}`, motionPrompt: "push in" })) };
        },
      },
      image: {
        modelId: "nano-banana-2",
        generateKeyframe: async ({ prompt, referenceImageUrls }) => (keyframes.push({ prompt, refs: referenceImageUrls }), { url: `file://${still}` }),
      },
      stills: new KenBurnsVideo(new LocalMediaStore(path.join(dir, "media")), defaultFfmpeg),
      av: {
        stems: { modelId: "demucs", separate: async () => (separated++, { vocalsUrl: `file://${song}`, accompanimentUrls: [] }) },
        singer: {
          modelId: "omnihuman-1.5",
          sing: async ({ audioUrl, prompt }) => {
            const seconds = await probeDuration(fileURLToPath(audioUrl));
            sung.push({ seconds, prompt });
            return { url: clip(`sing-${sung.length}`, seconds) };
          },
        },
        dancer: {
          modelId: "kling-3.0-motion",
          dance: async ({ referenceUrl, prompt, starUrl }) => {
            const refSeconds = await probeDuration(fileURLToPath(referenceUrl));
            danced.push({ refSeconds, prompt, star: starUrl });
            return { url: clip(`dance-${danced.length}`, refSeconds) };
          },
        },
        scenes: {
          modelId: "kling-3.0",
          animate: async ({ durationSec, starUrl }) => (scenes.push({ seconds: durationSec, star: starUrl }), { url: clip(`scene-${scenes.length}`, Math.ceil(durationSec)) }),
        },
      },
      assetsDir: assets,
    };
    const req: MusicVideoRequest = {
      kind: "full", songFile: song, title: "Dadi", lyrics: LYRICS, genre: "Pop", mood: "", style: "photoreal",
      resolution: "480p", watermark: false, photoUrl: "file:///p/me.jpg", danceStyle: "bhangra", range: { start: 2, end: 22 },
    };
    const job = path.join(dir, "job");
    await runMusicVideo(deps, req, job, undefined, "storyboard");
    const board = await loadStoryboard(job);
    expect(board.duration).toBe(20);
    expect(board.bpm).toBeCloseTo(120, 0);
    expect(board.star!.image).toMatch(/frames\/star\.jpg$/);
    // Every shot but the opening one starts on a downbeat.
    for (const s of board.shots.slice(1)) expect(board.downbeats.some((d) => Math.abs(d - s.start) < 0.02)).toBe(true);
    expect(new Set(board.shots.map((s) => s.type))).toEqual(new Set(["sing", "dance", "scene"]));
    // The star is drawn from the photo; every shot from the photo and the star.
    expect(keyframes[0].refs).toEqual(["file:///p/me.jpg"]);
    for (const k of keyframes.slice(1)) {
      expect(k.refs[0]).toBe("file:///p/me.jpg");
      expect(k.refs[1]).toBe(board.star!.image);
      expect(k.prompt).toContain(PHOTO_LIKENESS);
    }
    expect(sung).toHaveLength(0);

    const result = await runMusicVideo(deps, req, job, undefined, "render");
    const by = (t: string) => board.shots.filter((s) => s.type === t);
    expect(separated).toBe(1);
    expect(sung).toHaveLength(by("sing").length);
    by("sing").forEach((s, i) => expect(sung[i].seconds).toBeCloseTo(s.end - s.start, 1));
    for (const s of sung) expect(s.prompt).toContain(SINGER_SHOT);
    expect(danced).toHaveLength(by("dance").length);
    for (const d of danced) {
      expect(d.prompt).toContain("bhangra");
      expect(d.star).toBe(board.star!.image);
      expect(d.refSeconds).toBeLessThanOrEqual(5.1);
    }
    expect(scenes).toHaveLength(by("scene").length);
    expect(await probeDuration(result.output!)).toBeCloseTo(20, 0);
  }, 180_000);

  it("refuses to render AI shots when fal isn't set up", async () => {
    const job = path.join(dir, "job");
    const deps = { llm: {}, image: { modelId: "nano-banana-2" }, stills: { modelId: "ken-burns-ffmpeg" } } as unknown as MusicVideoDeps;
    await expect(runMusicVideo(deps, { kind: "full" } as MusicVideoRequest, job, undefined, "render")).rejects.toThrow(/aren't set up/);
  });
});
