import { mkdtemp, readFile, utimes, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { defaultFfmpeg, probeDuration } from "@/lib/ffmpeg";
import { guessKind, meaningfulWords, understand } from "@/lib/voice-create/heard";
import { INSTRUMENTAL, TUNE_ORIGINAL_STYLE, tuneSongCall, tuneSongSchema } from "@/lib/voice-create/hum-song";
import { mixAudioArgs, mixLength, mixSchema, mixVideoArgs } from "@/lib/voice-create/mix";
import { extractArgs, loadTake, saveTakeMeta, sweepOldTakes, TAKE_KEEP_MS, takeFiles, userFolder } from "@/lib/voice-create/takes";
import { findGenre } from "@/lib/songs/styles";

const words = (list: [string, number, number][]) => list.map(([word, start, end]) => ({ word, start, end }));

describe("what Reelkar heard", () => {
  it("treats Whisper's made-up words for humming as no words", () => {
    expect(meaningfulWords("Hmm hmm mmm la la la.")).toEqual([]);
    expect(meaningfulWords("Thank you for watching!")).toEqual([]);
    expect(meaningfulWords("[Music]")).toEqual([]);
    expect(meaningfulWords("tum hi ho")).toEqual(["tum", "hi", "ho"]);
  });

  it("guesses hum, sing or speech without the AI", () => {
    expect(guessKind("mmm hmm", [], 12)).toBe("hum");
    expect(guessKind("make a Punjabi wedding song about my sister", [], 4)).toBe("speech");
    expect(guessKind("गाना बनाओ मेरी बहन की शादी पर", [], 4)).toBe("speech");
    // Slow, held words: sung.
    const sung = words([["tere", 0, 1.2], ["bina", 1.4, 2.8], ["jiya", 3, 4.5], ["jaye", 4.6, 6]]);
    expect(guessKind("tere bina jiya jaye", sung, 6)).toBe("sing");
    // Quick words: talking.
    const said = words([["it's", 0, 0.2], ["about", 0.25, 0.5], ["chai", 0.55, 0.8], ["in", 0.85, 0.95], ["mumbai", 1, 1.4], ["rain", 1.45, 1.7]]);
    expect(guessKind("it's about chai in Mumbai rain", said, 2)).toBe("speech");
  });

  it("doesn't ask the AI about a hum", async () => {
    let asked = false;
    const heard = await understand({ completeJson: async () => ((asked = true), {}) }, { transcript: "hmm hmm", words: [], durationSec: 10 });
    expect(asked).toBe(false);
    expect(heard).toMatchObject({ kind: "hum", transcript: "", plan: { make: "song", title: "My tune" } });
  });

  it("takes the AI's plan for a request, and fixes values it made up", async () => {
    const llm = {
      completeJson: async () => ({
        kind: "speech",
        plan: { make: "reel", topic: "chai in Mumbai rain", title: "Chai Baarish", genre: "jazz-fusion", mood: "cosy", language: "hi", durationSec: 30, lyrics: "about chai in Mumbai rain" },
      }),
    };
    const heard = await understand(llm, { transcript: "a 30 second reel about chai in Mumbai rain", words: [], durationSec: 3 });
    expect(heard.kind).toBe("speech");
    expect(heard.plan).toMatchObject({ make: "reel", topic: "chai in Mumbai rain", durationSec: 30, genre: "bollywood-romantic", mood: "", lyrics: "" });
  });

  it("keeps sung recordings as songs with the sung lines as lyrics", async () => {
    const llm = { completeJson: async () => ({ kind: "sing", plan: { make: "reel", title: "Tere Bina", genre: "lofi", language: "hi", durationSec: 60, lyrics: "" } }) };
    const heard = await understand(llm, { transcript: "tere bina jiya jaye na", words: [], durationSec: 8 });
    expect(heard.plan).toMatchObject({ make: "song", genre: "lofi", lyrics: "tere bina jiya jaye na" });
  });

  it("falls back to its own guess when the AI fails", async () => {
    const heard = await understand({ completeJson: async () => Promise.reject(new Error("down")) }, { transcript: "make a song about my dog Bruno", words: [], durationSec: 3 });
    expect(heard).toMatchObject({ kind: "speech", plan: { make: "song", topic: "make a song about my dog Bruno" } });
  });
});

describe("a song on your tune", () => {
  const genre = findGenre("punjabi-pop")!;

  it("remixes the take with ACE-Step, keeping the tune", () => {
    const call = tuneSongCall({ takeMp3: "/data/voice/u/t.mp3", kind: "hum", genre, mood: "happy", vocal: "female", heardLyrics: "", lyrics: "" });
    expect(call.kind).toBe("cover");
    expect(call.input).toMatchObject({
      audioUrl: "file:///data/voice/u/t.mp3",
      originalStyle: TUNE_ORIGINAL_STYLE.hum,
      lyrics: INSTRUMENTAL,
      originalLyrics: INSTRUMENTAL,
    });
    expect((call.input as { style: string }).style).toContain("dhol");
    expect((call.input as { style: string }).style).toContain("female lead vocals");
  });

  it("sings the sung lines, as the creator fixed them", () => {
    const call = tuneSongCall({ takeMp3: "/t.mp3", kind: "sing", genre, mood: "", vocal: "auto", heardLyrics: "tere bina jiya jaye na", lyrics: "Tere bina jiya jaye na" });
    expect(call.input).toMatchObject({ originalStyle: TUNE_ORIGINAL_STYLE.sing, originalLyrics: "tere bina jiya jaye na", lyrics: "Tere bina jiya jaye na" });
  });

  it("validates the request", () => {
    expect(tuneSongSchema.safeParse({ kind: "hum", title: "", genre: "pop" }).success).toBe(false);
    expect(tuneSongSchema.parse({ kind: "hum", title: "Dhun", genre: "pop" })).toMatchObject({ language: "hi", topic: "", lyrics: "" });
  });
});

describe("takes", () => {
  it("keeps each user's takes in their own folder, with no user text in the path", () => {
    const files = takeFiles("/out", "abc/../x", "123e4567-e89b-12d3-a456-426614174000");
    expect(files.dir).toBe(path.resolve("/out/voice", userFolder("abc/../x")));
    expect(userFolder("abc/../x")).toMatch(/^[0-9a-f]{32}$/);
    expect(() => takeFiles("/out", "u", "../../etc/passwd")).toThrow();
  });

  it("saves and loads a take only for its owner", async () => {
    const out = await mkdtemp(path.join(os.tmpdir(), "takes-"));
    const id = "123e4567-e89b-12d3-a456-426614174000";
    const files = takeFiles(out, "alice", id);
    await saveTakeMeta(files, { id, kind: "sing", transcript: "la", durationSec: 9, videoFile: null, createdAt: new Date().toISOString() });
    expect((await loadTake(out, "alice", id))?.meta.kind).toBe("sing");
    expect(await loadTake(out, "bob", id)).toBeUndefined();
    expect(await loadTake(out, "alice", "nope")).toBeUndefined();
  });

  it("sweeps takes older than a day", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "sweep-"));
    await writeFile(path.join(dir, "old.mp3"), "x");
    await writeFile(path.join(dir, "new.mp3"), "x");
    const old = (Date.now() - TAKE_KEEP_MS - 60_000) / 1000;
    await utimes(path.join(dir, "old.mp3"), old, old);
    await sweepOldTakes(dir);
    expect(existsSync(path.join(dir, "old.mp3"))).toBe(false);
    expect(existsSync(path.join(dir, "new.mp3"))).toBe(true);
  });
});

describe("mix", () => {
  const base = { takeId: "123e4567-e89b-12d3-a456-426614174000" };

  it("needs a voice or a song", () => {
    expect(mixSchema.safeParse({ ...base, voiceVolume: 0 }).success).toBe(false);
    expect(mixSchema.safeParse({ ...base, voiceVolume: 0, songId: "123e4567-e89b-12d3-a456-426614174001" }).success).toBe(true);
  });

  it("lets the picture decide a video's length, and the song a replaced voice's", () => {
    const m = mixSchema.parse({ ...base, songId: "123e4567-e89b-12d3-a456-426614174001" });
    expect(mixLength(m, 20, 45, true)).toBe(20);
    expect(mixLength(m, 20, 45, false)).toBe(45);
    expect(mixLength({ ...m, voiceVolume: 0 }, 50, 30, false)).toBe(30);
    expect(mixLength({ ...m, startSec: 2, endSec: 12 }, 20, 45, false)).toBe(10);
    expect(() => mixLength({ ...m, startSec: 19.5 }, 20, undefined, false)).toThrow();
  });

  it("mixes a take and a song with ffmpeg, and a filmed clip into a video", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mix-"));
    const tone = path.join(dir, "tone.wav");
    const song = path.join(dir, "song.mp3");
    const clip = path.join(dir, "clip.mp4");
    await defaultFfmpeg(["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=220:duration=4", tone]);
    await defaultFfmpeg(["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=6", song]);
    await defaultFfmpeg(["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=red:s=180x320:d=4", "-f", "lavfi", "-i", "sine=frequency=330:duration=4", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", clip]);

    const files = { mp3: path.join(dir, "take.mp3"), wav: path.join(dir, "take-16k.wav") };
    await defaultFfmpeg(extractArgs(clip, files.mp3, files.wav));
    expect(await probeDuration(files.mp3)).toBeCloseTo(4, 0);

    const m = mixSchema.parse({ ...base, songId: "123e4567-e89b-12d3-a456-426614174001", fadeInSec: 1, fadeOutSec: 1, voiceVolume: 0.5 });
    const out = path.join(dir, "mix.mp3");
    await defaultFfmpeg(mixAudioArgs(m, tone, song, out, mixLength(m, 4, 6, false)));
    expect(await probeDuration(out)).toBeCloseTo(6, 0);

    const video = path.join(dir, "mix.mp4");
    await defaultFfmpeg(mixVideoArgs({ ...m, startSec: 1 }, clip, files.mp3, song, video, mixLength({ ...m, startSec: 1 }, 4, 6, true)));
    expect(await probeDuration(video)).toBeCloseTo(3, 0);
    expect((await readFile(video)).length).toBeGreaterThan(1000);
    expect(fileURLToPath(new URL(`file://${video}`))).toBe(video);
  });
});

describe("typed requests", () => {
  it("are always requests, even when short", async () => {
    const heard = await understand(undefined, { transcript: "dog song", words: [], durationSec: 0, typed: true });
    expect(heard).toMatchObject({ kind: "speech", plan: { topic: "dog song" } });
    const llm = { completeJson: async () => ({ kind: "sing", plan: { make: "song", topic: "dog", title: "Bruno", genre: "pop", language: "en", durationSec: 60, lyrics: "" } }) };
    expect((await understand(llm, { transcript: "a song for my dog Bruno", words: [], durationSec: 0, typed: true })).kind).toBe("speech");
  });
});

describe("a song on your tune, against a fake fal", () => {
  it("sends the take typed by its bytes and keeps fal's FLAC as FLAC", async () => {
    const { FalQueueClient } = await import("@/lib/providers/fal");
    const { FalSongEditor } = await import("@/lib/providers/fal-song-edit");
    const { runRemix } = await import("@/lib/songs/remix");
    const dir = await mkdtemp(path.join(os.tmpdir(), "tune-"));
    const take = path.join(dir, "take.mp3");
    await defaultFfmpeg(["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=262:duration=2", "-ac", "2", take]);
    const flac = Buffer.concat([Buffer.from("fLaC"), Buffer.alloc(64)]);
    const sent: Record<string, unknown>[] = [];
    const fetchFn = (async (url: string, init?: RequestInit) => {
      if (url.startsWith("https://queue.fal.run/")) {
        sent.push(JSON.parse(init!.body as string));
        return Response.json({ request_id: "r", status_url: "s", response_url: "o" });
      }
      if (url === "s") return Response.json({ status: "COMPLETED" });
      if (url === "o") return Response.json({ audio: { url: "https://cdn.test/out.wav", file_name: "out.wav" } });
      if (url === "https://cdn.test/out.wav") return new Response(flac);
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;
    const editor = new FalSongEditor(new FalQueueClient("k", fetchFn, 0), fetchFn);
    const call = tuneSongCall({ takeMp3: take, kind: "hum", genre: findGenre("pop")!, mood: "", vocal: "auto", heardLyrics: "", lyrics: "" });
    const audio = await runRemix(editor, call, { workDir: dir, ffmpeg: defaultFfmpeg, probeDuration });

    expect(String(sent[0].audio_url)).toMatch(/^data:audio\/mpeg;base64,/);
    expect(sent[0]).toMatchObject({ edit_mode: "remix", original_tags: TUNE_ORIGINAL_STYLE.hum, lyrics: INSTRUMENTAL });
    expect(audio.ext).toBe("flac");
  });
});
