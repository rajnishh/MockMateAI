import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { analyseSamples, analysisPath, ENVELOPE_RATE, envelopeAt, getSongAnalysis, PEAK_BARS } from "@/lib/songs/analysis";

const RATE = 11025;
const dir = mkdtempSync(path.join(tmpdir(), "song-analysis-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// Short noise bursts on every beat over a quiet hum.
function clickTrack(bpm: number, seconds: number, offset = 0.2): Float32Array {
  const s = new Float32Array(Math.round(seconds * RATE));
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < s.length; i++) s[i] = 0.02 * Math.sin((2 * Math.PI * 110 * i) / RATE);
  for (let t = offset; t < seconds; t += 60 / bpm) {
    const start = Math.round(t * RATE);
    for (let j = 0; j < 0.04 * RATE && start + j < s.length; j++) s[start + j] += 0.8 * rand() * Math.exp(-j / (0.01 * RATE));
  }
  return s;
}

describe("song analysis", () => {
  it("finds the tempo and the beats of a steady track", () => {
    for (const bpm of [96, 120, 140]) {
      const a = analyseSamples(clickTrack(bpm, 20), RATE);
      expect(Math.abs(a.bpm - bpm)).toBeLessThanOrEqual(2);
      const gaps = a.beats.slice(1).map((b, i) => b - a.beats[i]);
      const avg = gaps.reduce((x, y) => x + y, 0) / gaps.length;
      expect(Math.abs(avg - 60 / bpm)).toBeLessThan(0.02);
      // The grid sits on the clicks, not between them.
      const phase = (a.beats[3] - 0.2) / (60 / bpm);
      expect(Math.abs(phase - Math.round(phase))).toBeLessThan(0.1);
      expect(a.strength).toHaveLength(a.beats.length);
    }
  });

  it("gives an envelope, waveform peaks and no beat for silence", () => {
    const a = analyseSamples(clickTrack(120, 10), RATE);
    expect(a.envelope).toHaveLength(10 * ENVELOPE_RATE);
    expect(a.peaks).toHaveLength(PEAK_BARS);
    expect(Math.max(...a.peaks)).toBe(1);
    expect(a.envelope.every((v) => v >= 0 && v <= 1)).toBe(true);
    const quiet = analyseSamples(new Float32Array(RATE * 5), RATE);
    expect(quiet.bpm).toBe(0);
    expect(quiet.beats).toEqual([]);
  });

  it("interpolates the envelope and is 0 outside the song", () => {
    expect(envelopeAt([0, 1], 0.5 / ENVELOPE_RATE)).toBeCloseTo(0.5);
    expect(envelopeAt([0, 1], -1)).toBe(0);
    expect(envelopeAt([0, 1], 99)).toBe(0);
  });

  it("times lyric lines with Whisper words, caches the result and shares a run", async () => {
    const file = path.join(dir, "song.mp3");
    writeFileSync(file, "fake audio");
    let decodes = 0;
    const deps = {
      decode: async () => {
        decodes++;
        return clickTrack(120, 12);
      },
      whisper: { words: async () => [{ start: 1, end: 2 }, { start: 2.1, end: 3 }, { start: 6, end: 7 }, { start: 7.2, end: 10 }] },
    };
    const lyrics = "[Verse]\nBaarish ki boondein\n\n[Chorus]\nChai ke saath";
    const [a, b] = await Promise.all([getSongAnalysis(file, lyrics, deps), getSongAnalysis(file, lyrics, deps)]);
    expect(a).toEqual(b);
    expect(a.timing).toBe("words");
    expect(a.lines.map((l) => l.text)).toEqual(["Baarish ki boondein", "Chai ke saath"]);
    expect(a.lines[0].start).toBe(1);
    expect(JSON.parse(readFileSync(analysisPath(file), "utf8")).bpm).toBe(a.bpm);
    await getSongAnalysis(file, lyrics, deps);
    expect(decodes).toBe(1);
  });

  it("spreads lines evenly when Whisper fails", async () => {
    const file = path.join(dir, "even.mp3");
    writeFileSync(file, "fake audio");
    const a = await getSongAnalysis(file, "One line\nTwo line", {
      decode: async () => clickTrack(100, 10),
      whisper: { words: async () => Promise.reject(new Error("down")) },
    });
    expect(a.timing).toBe("even");
    expect(a.lines).toHaveLength(2);
  });
});
