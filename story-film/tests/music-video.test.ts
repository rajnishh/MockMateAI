import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LocalMediaStore } from "@/lib/media";
import { MUSIC_VIDEO_CREDITS_PER_5S } from "@/lib/billing/catalog";
import { buildMusicVideoCutArgs } from "@/lib/music-video/assemble";
import { detectBeats, evenGrid, PCM_RATE } from "@/lib/music-video/beats";
import {
  buildShotPrompt, DANCER_SHOT, framePrompt, linesInRange, loadStoryboard, lyricCues, type MusicVideoDeps, type MusicVideoRequest,
  runMusicVideo, SINGER_SHOT, type Storyboard, writeShotPrompts,
} from "@/lib/music-video/pipeline";
import { applyStoryboardChanges, storyboardView } from "@/lib/music-video/request";
import { KIND_SHOT_TYPES, planShots, SHOT_SECONDS } from "@/lib/music-video/shots";
import { planScenes, singableLines, timeLines } from "@/lib/music-video/timing";
import { defaultFfmpeg, PHOTO_LIKENESS } from "@/lib/pipeline/orchestrator";
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
    kind: "full", songFile: "x.mp3", title: "Baarish", lyrics: LYRICS, genre: "Bollywood romantic", mood: "romantic",
    style: "animated", resolution: "480p", watermark: false, danceStyle: "bhangra",
    character: { name: "Mia", description: "girl with a yellow raincoat", referenceImageUrl: "file:///r.jpg", seed: 3 },
  };

  it("asks for one English shot per segment, saying what each shot is for", () => {
    const prompt = buildShotPrompt(req, [
      { start: 0, end: 4, lines: [], type: "dance" },
      { start: 4, end: 8, lines: ["बारिश की बूँदें गिरें"], type: "sing" },
    ]);
    expect(prompt).toContain("Return exactly 2 shots");
    expect(prompt).toContain("The star is Mia: girl with a yellow raincoat");
    expect(prompt).toContain("(instrumental)");
    expect(prompt).toContain("DANCE:");
    expect(prompt).toContain("SING:");
    expect(prompt).toContain("Bhangra");
    expect(prompt).toContain("Never depict real singers");
  });

  it("pads a short shot list instead of failing", async () => {
    const llm = { modelId: "llama-3.3-70b", writeScript: async () => { throw new Error(); }, completeJson: async () => ({ shots: [{ imagePrompt: "a" }] }) } as LlmProvider;
    const out = await writeShotPrompts(llm, req, [{ start: 0, end: 4, lines: [], type: "scene" }, { start: 4, end: 8, lines: [], type: "scene" }]);
    expect(out.shots.map((s) => s.imagePrompt)).toEqual(["a", "a"]);
  });

  it("accepts a list named scenes, and asks again once when the reply is unusable", async () => {
    let calls = 0;
    const llm = {
      modelId: "llama-3.3-70b",
      writeScript: async () => { throw new Error(); },
      completeJson: async () => (++calls === 1 ? { star: "x" } : { scenes: [{ imagePrompt: "b" }] }),
    } as LlmProvider;
    const out = await writeShotPrompts(llm, req, [{ start: 0, end: 4, lines: [], type: "scene" }]);
    expect(calls).toBe(2);
    expect(out.shots[0].imagePrompt).toBe("b");
  });

  it("frames each shot for its model: a close-up to sing, the whole body to dance, no people in lyric art", () => {
    const board = { star: { description: "a girl in a yellow raincoat" }, look: { style: "animated" as const, photoUrl: "file:///me.jpg" } };
    expect(framePrompt(board, { type: "sing", imagePrompt: "on a rooftop" })).toContain(SINGER_SHOT);
    expect(framePrompt(board, { type: "dance", imagePrompt: "on a beach" })).toContain(DANCER_SHOT);
    expect(framePrompt(board, { type: "scene", imagePrompt: "at a bus stop" })).toContain(PHOTO_LIKENESS);
    const art = framePrompt(board, { type: "lyric", imagePrompt: "rain drops" });
    expect(art).toContain("no text");
    expect(art).not.toContain(PHOTO_LIKENESS);
  });

  it("moves lyric timings onto the part of the song the video uses", () => {
    const timed = [
      { text: "a", start: 2, end: 6 },
      { text: "b", start: 10, end: 14 },
      { text: "c", start: 30, end: 33 },
    ];
    expect(linesInRange(timed, 5, 12)).toEqual([
      { text: "a", start: 0, end: 1 },
      { text: "b", start: 5, end: 9 },
    ]);
  });
});

describe("beats", () => {
  // A click on every beat at 120 BPM (0.5 s) from 0.25 s, the first beat of each bar louder.
  function clickTrack(seconds: number) {
    const pcm = new Float32Array(Math.round(seconds * PCM_RATE));
    for (let b = 0; 0.25 + b * 0.5 < seconds; b++) {
      const at = Math.round((0.25 + b * 0.5) * PCM_RATE);
      const loud = b % 4 === 1 ? 1 : 0.4;
      for (let i = 0; i < 400 && at + i < pcm.length; i++) pcm[at + i] = loud * Math.sin(i * 1.3) * Math.exp(-i / 80);
    }
    return pcm;
  }

  it("finds the tempo, the beats and the downbeats", () => {
    const grid = detectBeats(clickTrack(20), 20);
    expect(grid.bpm).toBeCloseTo(120, 0);
    expect(grid.beats[0]).toBeCloseTo(0.25, 1);
    expect(grid.downbeats[0]).toBeCloseTo(0.75, 1);
    for (let i = 1; i < grid.downbeats.length; i++) expect(grid.downbeats[i] - grid.downbeats[i - 1]).toBeCloseTo(2, 1);
  });

  it("uses a known tempo and falls back to an even grid on silence", () => {
    expect(detectBeats(new Float32Array(PCM_RATE * 4), 4).bpm).toBe(120);
    expect(detectBeats(clickTrack(10), 10, 96).bpm).toBe(96);
    expect(evenGrid(4, 120).downbeats).toEqual([0, 2]);
  });
});

describe("shot planning", () => {
  const grid = evenGrid(60, 120); // a downbeat every 2 s
  const timed = Array.from({ length: 10 }, (_, i) => ({ text: `line ${i}`, start: 6 + i * 5, end: 10.5 + i * 5 }));

  it("cuts on downbeats, covering the song, within each kind's lengths", () => {
    for (const kind of ["lyric", "story", "performance", "full"] as const) {
      const shots = planShots(kind, 60, grid, timed);
      expect(shots[0].start).toBe(0);
      expect(shots.at(-1)!.end).toBe(60);
      for (let i = 1; i < shots.length; i++) {
        expect(shots[i].start).toBe(shots[i - 1].end);
        expect(shots[i].start % 2).toBe(0);
      }
      for (const s of shots) {
        expect(s.end - s.start).toBeLessThanOrEqual(SHOT_SECONDS[kind].max + 0.001);
        expect(s.end - s.start).toBeGreaterThanOrEqual(SHOT_SECONDS[kind].min - 0.001);
        expect(KIND_SHOT_TYPES[kind]).toContain(s.type);
      }
    }
  });

  it("mixes the full video about 40% singing, 25% dancing, 35% story, never three alike in a row", () => {
    const shots = planShots("full", 60, grid, timed);
    const share = (t: string) => shots.filter((s) => s.type === t).reduce((a, s) => a + s.end - s.start, 0) / 60;
    expect(share("sing")).toBeGreaterThan(0.3);
    expect(share("sing")).toBeLessThan(0.5);
    expect(share("dance")).toBeGreaterThan(0.15);
    expect(share("dance")).toBeLessThan(0.35);
    expect(share("scene")).toBeGreaterThan(0.25);
    for (let i = 2; i < shots.length; i++) expect(new Set([shots[i].type, shots[i - 1].type, shots[i - 2].type]).size).toBeGreaterThan(1);
    // Singing shots have words to sing.
    for (const s of shots.filter((x) => x.type === "sing")) expect(s.lines.length).toBeGreaterThan(0);
  });

  it("sings the sung parts of a performance and fills instrumentals with scenes", () => {
    const shots = planShots("performance", 60, grid, timed);
    expect(shots[0].type).toBe("scene");
    expect(shots.filter((s) => s.type === "sing").length).toBeGreaterThan(shots.length / 2);
  });
});

describe("storyboard changes", () => {
  const board = (): Storyboard => ({
    kind: "full", title: "t", duration: 8, offset: 0, bpm: 120, downbeats: [0, 2, 4, 6], timed: [],
    look: { style: "animated" }, redraws: 0,
    shots: [
      { start: 0, end: 4, type: "sing", lines: ["a"], imagePrompt: "rooftop", motionPrompt: "m", frame: "file:///f0.jpg" },
      { start: 4, end: 8, type: "scene", lines: [], imagePrompt: "beach", motionPrompt: "m", frame: "file:///f1.jpg" },
    ],
  });

  it("redraws shots whose words, type or picture the creator changed", () => {
    const b = board();
    expect(applyStoryboardChanges(b, { shots: [{ type: "sing", imagePrompt: "rooftop", redraw: false }, { type: "dance", imagePrompt: "beach", redraw: false }] })).toEqual([1]);
    expect(b.shots[1].type).toBe("dance");
    expect(applyStoryboardChanges(board(), { shots: [{ type: "sing", imagePrompt: "temple", redraw: false }, { type: "scene", imagePrompt: "beach", redraw: true }] })).toEqual([0, 1]);
  });

  it("refuses shot types the kind can't make, and a stale shot list", () => {
    const story = { ...board(), kind: "story" as const };
    expect(applyStoryboardChanges(story, { shots: [{ type: "dance", imagePrompt: "x", redraw: false }, { type: "scene", imagePrompt: "y", redraw: false }] })).toMatch(/can't have a dance/);
    expect(applyStoryboardChanges(board(), { shots: [{ type: "sing", imagePrompt: "x", redraw: false }] })).toMatch(/reload/);
  });

  it("shows prices and pictures without server paths", () => {
    const view = storyboardView({ ...board(), star: { description: "s", image: "file:///out/f/frames/star.jpg" } }, "/api/songs/s/music-video/f");
    expect(view.credits).toBe(2 * MUSIC_VIDEO_CREDITS_PER_5S.full);
    expect(view.star!.imageUrl).toBe("/api/songs/s/music-video/f/frame/star.jpg");
    expect(view.shots[0].frameUrl).toBe("/api/songs/s/music-video/f/frame/f0.jpg");
    expect(JSON.stringify(view)).not.toContain("file://");
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
  it("uses the song as the only audio, slot lengths per clip, and flashes on downbeats", () => {
    const args = buildMusicVideoCutArgs({ clips: ["a", "b"], durations: [4.5, 3.25], song: "s.mp3", resolution: "720p", watermark: false, output: "o", flashes: [2, 4] });
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain("[0:v]scale=720:1280");
    expect(graph).toContain("trim=duration=4.5");
    expect(graph).toContain("trim=duration=3.25");
    expect(graph).toContain("[2:a]aformat=sample_rates=44100:channel_layouts=stereo,apad,atrim=duration=7.75");
    expect(graph).toContain("between(t,2,2.09)+between(t,4,4.09)");
    expect(graph).toContain("Created with AI");
    expect(args[args.indexOf("-t") + 1]).toBe("7.75");
  });

  it("makes a real lyric video end to end, storyboard first", async () => {
    const song = path.join(dir, "song.wav");
    const still = path.join(dir, "still.png");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=330:duration=20", song]);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=720x720", "-frames:v", "1", still]);
    const stages: string[] = [];
    let prompted = 0;
    const deps: MusicVideoDeps = {
      llm: {
        modelId: "llama-3.3-70b",
        writeScript: async () => { throw new Error(); },
        completeJson: async (p: string) => {
          prompted = Number(/Return exactly (\d+) shots/.exec(p)![1]);
          return { star: "", shots: Array.from({ length: prompted }, (_, i) => ({ imagePrompt: `art ${i}`, motionPrompt: "zoom" })) };
        },
      },
      image: { modelId: "flux-1-schnell", generateKeyframe: async () => ({ url: `file://${still}` }) },
      stills: new KenBurnsVideo(new LocalMediaStore(path.join(dir, "media")), defaultFfmpeg),
      whisper: { modelId: "whisper", words: async () => [{ start: 3, end: 6 }, { start: 7, end: 10 }, { start: 11, end: 14 }, { start: 15, end: 17 }] },
    };
    const req: MusicVideoRequest = { kind: "lyric", songFile: song, title: "Test", lyrics: LYRICS, genre: "Pop", mood: "", style: "animated", resolution: "480p", watermark: false };
    const job = path.join(dir, "job");
    const first = await runMusicVideo(deps, req, job, (s) => void stages.push(s), "storyboard");
    expect(first.output).toBeNull();
    const board = await loadStoryboard(job);
    expect(board.shots.length).toBe(prompted);
    expect(board.shots.every((s) => s.type === "lyric" && s.frame)).toBe(true);
    expect(board.star).toBeUndefined();

    const result = await runMusicVideo(deps, req, job, (s) => void stages.push(s), "render");
    expect(stages).toEqual(["timing", "beats", "scenes", "keyframes", "clips", "assemble", "done"]);
    const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "default=nw=1", result.output!]).toString();
    expect(Number(/duration=([\d.]+)/.exec(probe)![1])).toBeCloseTo(20, 0);
    expect(probe).toContain("codec_type=audio");
    expect(probe).toContain("width=480");
  }, 120_000);
});
