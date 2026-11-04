import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LocalMediaStore } from "@/lib/media";
import { buildScenePrompt, lyricCues, type MusicVideoRequest, runMusicVideo, writeScenePrompts } from "@/lib/music-video/pipeline";
import { planScenes, singableLines, timeLines } from "@/lib/music-video/timing";
import { buildMusicVideoArgs } from "@/lib/pipeline/assemble";
import { defaultFfmpeg } from "@/lib/pipeline/orchestrator";
import { KenBurnsVideo } from "@/lib/providers/kenburns";
import type { LlmProvider } from "@/lib/providers/types";
import { CloudflareWhisper } from "@/lib/providers/whisper";

const dir = mkdtempSync(path.join(tmpdir(), "mv-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const LYRICS = "[Verse]\nबारिश की बूँदें गिरें\nदादी की रसोई महके\n\n[Chorus]\nयादों के गीत\nदादी का प्यार";

describe("lyric timing", () => {
  it("keeps only sung lines", () => {
    expect(singableLines(LYRICS)).toEqual(["बारिश की बूँदें गिरें", "दादी की रसोई महके", "यादों के गीत", "दादी का प्यार"]);
  });

  it("starts with the singing and snaps line breaks to pauses", () => {
    // Singing from 4s to 16s, with clear breaths at 7s, 10.5s and 13s.
    const words = [
      { start: 4, end: 4.8 }, { start: 5, end: 6.5 },
      { start: 7, end: 8 }, { start: 8.1, end: 9.8 },
      { start: 10.5, end: 12.4 },
      { start: 13, end: 16 },
    ];
    const timed = timeLines(singableLines(LYRICS), words, 20);
    expect(timed.map((l) => l.start)).toEqual([4, 7, 10.5, 13]);
    expect(timed[3].end).toBe(16);
  });

  it("falls back to even spacing without word timings and caps long lines", () => {
    const timed = timeLines(["a", "b"], [], 100);
    expect(timed[0].start).toBe(8);
    expect(timed[0].end - timed[0].start).toBeLessThanOrEqual(8);
    expect(timeLines([], [], 10)).toEqual([]);
  });
});

describe("scene planning", () => {
  it("covers the whole song, within bounds, cutting on line starts", () => {
    const timed = [
      { text: "one", start: 4, end: 7 },
      { text: "two", start: 7, end: 10.5 },
      { text: "three", start: 10.5, end: 13 },
      { text: "four", start: 13, end: 16 },
    ];
    const scenes = planScenes(timed, 20, 3, 5);
    expect(scenes[0].start).toBe(0);
    expect(scenes.at(-1)!.end).toBe(20);
    for (let i = 1; i < scenes.length; i++) expect(scenes[i].start).toBe(scenes[i - 1].end);
    for (const s of scenes) {
      expect(s.end - s.start).toBeLessThanOrEqual(5.001);
      expect(s.end - s.start).toBeGreaterThanOrEqual(2.5);
    }
    expect(scenes.some((s) => s.start === 7)).toBe(true);
    // The intro before the singing is its own scene with no lyrics.
    expect(scenes[0].lines).toEqual([]);
    expect(scenes.find((s) => s.start === 4)!.lines).toEqual(["one"]);
  });
});

describe("captions and prompts", () => {
  it("splits long lyric lines into two captions", () => {
    const cues = lyricCues([{ text: "this is a really long lyric line that will not fit", start: 0, end: 4 }]);
    expect(cues).toHaveLength(2);
    expect(cues[0].end).toBe(2);
    expect(cues[1].start).toBe(2);
  });

  const req: MusicVideoRequest = {
    songFile: "x.mp3", title: "Baarish", lyrics: LYRICS, genre: "Bollywood romantic", mood: "romantic",
    style: "animated", resolution: "480p", watermark: false, sceneSec: { min: 4, max: 7 },
    character: { name: "Mia", description: "girl with a yellow raincoat", referenceImageUrl: "file:///r.jpg", seed: 3 },
  };

  it("asks for one English scene per segment with the character pinned", () => {
    const prompt = buildScenePrompt(req, [{ start: 0, end: 4, lines: [] }, { start: 4, end: 8, lines: ["बारिश की बूँदें गिरें"] }]);
    expect(prompt).toContain("Return exactly 2 scenes");
    expect(prompt).toContain('"Mia, girl with a yellow raincoat"');
    expect(prompt).toContain("(instrumental)");
    expect(prompt).toContain("Never depict real singers");
  });

  it("pads a short scene list instead of failing", async () => {
    const llm = { modelId: "llama-3.3-70b", writeScript: async () => { throw new Error(); }, completeJson: async () => ({ scenes: [{ imagePrompt: "a" }] }) } as LlmProvider;
    const out = await writeScenePrompts(llm, req, [{ start: 0, end: 4, lines: [] }, { start: 4, end: 8, lines: [] }]);
    expect(out.map((s) => s.imagePrompt)).toEqual(["a", "a"]);
  });
});

describe("Whisper client", () => {
  it("posts raw audio and returns word timings", async () => {
    let init: RequestInit | undefined;
    const fetchFn = (async (_u: string, i: RequestInit) => {
      init = i;
      return Response.json({ result: { text: "x", words: [{ word: "x", start: 1.2, end: 1.6 }] } });
    }) as unknown as typeof fetch;
    const words = await new CloudflareWhisper("acct", "tok", fetchFn).words(Buffer.from("audio"));
    expect(words).toEqual([{ start: 1.2, end: 1.6 }]);
    expect((init!.headers as Record<string, string>)["Content-Type"]).toBe("application/octet-stream");
  });
});

describe("assembly", () => {
  it("uses the song as the only audio and slot lengths per clip", () => {
    const args = buildMusicVideoArgs({ clips: ["a", "b"], durations: [4.5, 3.25], song: "s.mp3", resolution: "720p", watermark: false, output: "o" });
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain("[0:v]scale=720:1280");
    expect(graph).toContain("trim=duration=4.5");
    expect(graph).toContain("trim=duration=3.25");
    expect(graph).toContain("[2:a]aformat=sample_rates=44100:channel_layouts=stereo,atrim=duration=7.75");
    expect(args[args.indexOf("-t") + 1]).toBe("7.75");
  });

  it("renders a real music video end to end", async () => {
    const song = path.join(dir, "song.wav");
    const still = path.join(dir, "still.png");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=330:duration=20", song]);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=720x720", "-frames:v", "1", still]);
    const stages: string[] = [];
    let prompted = 0;
    const result = await runMusicVideo(
      {
        llm: {
          modelId: "llama-3.3-70b",
          writeScript: async () => { throw new Error(); },
          completeJson: async (p: string) => {
            prompted = Number(/Return exactly (\d+) scenes/.exec(p)![1]);
            return { scenes: Array.from({ length: prompted }, (_, i) => ({ imagePrompt: `scene ${i}`, motionPrompt: "zoom" })) };
          },
        },
        image: { modelId: "flux-1-schnell", generateKeyframe: async () => ({ url: `file://${still}` }) },
        video: new KenBurnsVideo(new LocalMediaStore(path.join(dir, "media")), defaultFfmpeg),
        whisper: { modelId: "whisper", words: async () => [{ start: 3, end: 6 }, { start: 7, end: 10 }, { start: 11, end: 14 }, { start: 15, end: 17 }] },
      },
      { ...{ songFile: song, title: "Test", lyrics: LYRICS, genre: "Pop", mood: "", style: "animated", resolution: "480p", watermark: false, sceneSec: { min: 4, max: 7 } } },
      path.join(dir, "job"),
      (s) => void stages.push(s),
    );

    expect(stages).toEqual(["timing", "scenes", "keyframes", "clips", "assemble", "done"]);
    expect(prompted).toBeGreaterThanOrEqual(3);
    const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "default=nw=1", result.output]).toString();
    expect(Number(/duration=([\d.]+)/.exec(probe)![1])).toBeCloseTo(20, 0);
    expect(probe).toContain("codec_type=audio");
    expect(probe).toContain("width=480");
  }, 120_000);
});
