import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultFfmpeg, probeDuration } from "@/lib/ffmpeg";
import {
  changedGains,
  computePeaks,
  mixArgs,
  mixRequestSchema,
  mixTitle,
  peaksArgs,
  presetLength,
  readStemsState,
  SOUND_PRESETS,
  STEMS,
  stemFile,
  writeStemsState,
} from "@/lib/songs/mix";
import { lyricsWithRap, rapBarCount, rapStyle } from "@/lib/songs/rap";
import { remixCall, remixKindList, remixRequestSchema } from "@/lib/songs/remix";
import { separateSongStems } from "@/lib/songs/stems";

async function tone(dir: string, name: string, sec = 4, freq = 220): Promise<string> {
  const file = path.join(dir, name);
  await defaultFfmpeg(["-y", "-loglevel", "error", "-f", "lavfi", "-i", `sine=f=${freq}:d=${sec}`, "-ac", "2", "-b:a", "128k", file]);
  return file;
}

describe("sound presets", () => {
  it.each(SOUND_PRESETS.map((p) => p.id))("renders %s with ffmpeg", async (preset) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mix-"));
    const song = await tone(dir, "song.mp3");
    const output = path.join(dir, "out.mp3");
    await defaultFfmpeg(mixArgs({ songFile: song, preset, output }));
    expect(await probeDuration(output)).toBeCloseTo(presetLength(preset, 4), 0);
  });

  it("previews only the first seconds", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mix-"));
    const song = await tone(dir, "song.mp3", 6);
    const output = path.join(dir, "preview.mp3");
    await defaultFfmpeg(mixArgs({ songFile: song, preset: "bass", output, previewSec: 2 }));
    expect(await probeDuration(output)).toBeCloseTo(2, 0);
  });

  it("slows the song down for slowed + reverb", () => {
    expect(presetLength("slowed", 85)).toBeCloseTo(100);
    expect(presetLength("hall", 85)).toBe(85);
  });
});

describe("mixing stems", () => {
  it("mixes the unmuted stems at their levels, then adds the sound", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mix-"));
    const stems = await Promise.all([220, 330, 440, 550].map((f, i) => tone(dir, `s${i}.mp3`, 3, f)));
    const args = mixArgs({ songFile: "unused.mp3", stems: stems.map((file, i) => ({ file, gain: i === 1 ? 0 : 0.5 })), preset: "master", output: path.join(dir, "out.mp3") });

    // The muted stem isn't even read.
    expect(args.filter((a) => a.startsWith(dir) && a.endsWith(".mp3") && !a.endsWith("out.mp3"))).toHaveLength(3);
    expect(args.join(" ")).toContain("amix=inputs=3");
    expect(args.join(" ")).toContain("loudnorm=I=-14");
    await defaultFfmpeg(args);
    expect(await probeDuration(path.join(dir, "out.mp3"))).toBeCloseTo(3, 0);
  });

  it("only keeps the levels that changed", () => {
    expect(changedGains({ vocals: 1, drums: 1 })).toBeUndefined();
    expect(changedGains({ vocals: 0, drums: 1, bass: 1.5 })).toEqual({ vocals: 0, bass: 1.5 });
  });

  it("checks mix requests", () => {
    expect(mixRequestSchema.safeParse({}).success).toBe(false);
    expect(mixRequestSchema.safeParse({ preset: "loud" }).success).toBe(false);
    expect(mixRequestSchema.safeParse({ gains: { vocals: 0, drums: 0, bass: 0, other: 0 } }).success).toBe(false);
    expect(mixRequestSchema.safeParse({ gains: { vocals: 3 } }).success).toBe(false);
    expect(mixRequestSchema.safeParse({ gains: { vocals: 0 }, preset: "8d" }).success).toBe(true);
  });

  it("names the new song after what changed", () => {
    expect(mixTitle("Chai", { gains: { vocals: 0 } })).toBe("Chai (mix)");
    expect(mixTitle("Chai (mix)", { preset: "lofi" })).toBe("Chai (lo-fi tape sound)");
  });
});

describe("waveform peaks", () => {
  it("reads loudness per bar from ffmpeg's samples", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "peaks-"));
    // Quiet for 2 s, then loud for 2 s.
    const song = path.join(dir, "song.mp3");
    await defaultFfmpeg(["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=f=220:d=4", "-af", "volume='if(lt(t,2),0.1,1)':eval=frame", song]);
    await defaultFfmpeg(peaksArgs(song, path.join(dir, "raw")));
    const peaks = computePeaks(await readFile(path.join(dir, "raw")), 8);
    expect(peaks).toHaveLength(8);
    expect(Math.max(...peaks)).toBe(1);
    expect(peaks[1]).toBeLessThan(0.3);
    expect(peaks[6]).toBeGreaterThan(0.8);
  });

  it("draws a flat line for silence or nothing", () => {
    expect(computePeaks(Buffer.alloc(0), 4)).toEqual([0, 0, 0, 0]);
  });
});

describe("stems", () => {
  it("saves the four stems from fal and marks them ready", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "stems-"));
    const song = await tone(dir, "song.mp3", 2);
    const mp3 = await readFile(song);
    let sent = "";
    const separator = {
      modelId: "demucs",
      separateAll: async (url: string) => {
        sent = url;
        return Object.fromEntries(STEMS.map((s) => [s, `https://cdn.test/${s}.mp3`])) as Record<(typeof STEMS)[number], string>;
      },
    };
    const fetchFn = (async () => new Response(mp3)) as unknown as typeof fetch;
    const stemsDir = path.join(dir, "song-stems");
    await separateSongStems(separator, song, stemsDir, { ffmpeg: defaultFfmpeg, fetchFn });

    expect(sent.startsWith("data:audio/mpeg;base64,")).toBe(true);
    for (const s of STEMS) expect((await stat(stemFile(stemsDir, s))).size).toBeGreaterThan(0);
    expect(await readStemsState(stemsDir)).toEqual({ status: "ready" });
  });

  it("treats a split that never finished as failed", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "stems-"));
    expect(await readStemsState(dir)).toEqual({ status: "none" });
    await writeStemsState(dir, { status: "running", startedAt: new Date(0).toISOString() });
    expect((await readStemsState(dir, 60 * 60 * 1000)).status).toBe("failed");
    await writeFile(path.join(dir, "state.json"), JSON.stringify({ status: "running", startedAt: new Date().toISOString() }));
    expect((await readStemsState(dir)).status).toBe("running");
  });
});

describe("Add a rap", () => {
  const lyrics = "[Verse]\nline one\nline two\n[Chorus]\nline three\nline four";

  it("swaps the lines sung in the part for the rap bars", () => {
    // 4 sung lines over 40 s: the part 10–20 s holds the second line.
    expect(lyricsWithRap(lyrics, 40, 10, 20, "bar a\nbar b")).toBe("[Verse]\nline one\n[Rap]\nbar a\nbar b\n[Chorus]\nline three\nline four");
    expect(lyricsWithRap(lyrics, 40, 20, 40, "bar a\nbar b")).toBe("[Verse]\nline one\nline two\n[Chorus]\n[Rap]\nbar a\nbar b");
  });

  it("adds the rap at the end when the song has no lyrics", () => {
    expect(lyricsWithRap("", 40, 0, 10, "bar a")).toBe("[Rap]\nbar a");
  });

  it("is a replaced part sung with rap tags", () => {
    const req = remixRequestSchema.parse({ kind: "rap", startSec: 10, endSec: 20, bars: "chai ki pyali, sapne hain khaali" });
    const call = remixCall(req, { audioUrl: "file:///song.mp3", style: "bollywood pop", lyrics, durationSec: 40 });
    expect(call.kind).toBe("replace");
    if (call.kind !== "replace") return;
    expect(call.input).toMatchObject({ startSec: 10, endSec: 20, style: rapStyle("bollywood pop") });
    expect(call.input.lyrics).toContain("[Rap]\nchai ki pyali, sapne hain khaali");
  });

  it("needs bars and a part", () => {
    expect(remixRequestSchema.safeParse({ kind: "rap", startSec: 10, endSec: 20 }).success).toBe(false);
    expect(remixRequestSchema.safeParse({ kind: "rap", bars: "some new bars here" }).success).toBe(false);
  });

  it("asks for about one bar every 2.5 seconds", () => {
    expect(rapBarCount(20)).toBe(8);
    expect(rapBarCount(1)).toBe(2);
    expect(rapBarCount(120)).toBe(16);
  });
});

describe("remix kinds", () => {
  it("lists every kind with its price and inputs", () => {
    const kinds = remixKindList();
    expect(kinds.map((k) => k.kind)).toEqual(expect.arrayContaining(["cover", "extend", "replace", "rap"]));
    expect(kinds.find((k) => k.kind === "cover")).toMatchObject({ style: "required", part: false, credits: 2 });
    expect(kinds.find((k) => k.kind === "rap")).toMatchObject({ label: "Add a rap", part: true, bars: true, credits: 1 });
  });
});
