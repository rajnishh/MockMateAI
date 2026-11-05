// Song analysis for the player: loudness, beats, waveform and lyric line timing. Worked out once
// per song file and cached next to it, so phones and browsers only draw it.
import { execFile } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { singableLines, type TimedLine, timeLines, type Word } from "@/lib/music-video/timing";

const execFileAsync = promisify(execFile);

// Bump when the shape or the maths changes, so cached files are worked out again.
export const ANALYSIS_VERSION = 1;
export const ENVELOPE_RATE = 20;
export const PEAK_BARS = 160;
const SAMPLE_RATE = 11025;
const FRAME_RATE = 100;

export interface SongAnalysis {
  version: number;
  duration: number;
  // Loudness 0..1, ENVELOPE_RATE values a second.
  envelope: number[];
  // 0 when no steady beat was found.
  bpm: number;
  beats: number[];
  // How hard each beat hits, 0..1, one per beat.
  strength: number[];
  // Waveform bars 0..1 for the scrubber.
  peaks: number[];
  lines: TimedLine[];
  // "words" when Whisper heard the singing; "even" when the lines are spread by length.
  timing: "words" | "even";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Mono float samples at SAMPLE_RATE, straight from ffmpeg.
export async function decodeMono(file: string): Promise<Float32Array> {
  const { stdout } = await execFileAsync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "f32le", "pipe:1"], {
    encoding: "buffer",
    maxBuffer: 128 * 1024 * 1024,
  });
  const buf = stdout as Buffer;
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength - (buf.byteLength % 4)));
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

// Loudness in windows of 1/rate seconds, scaled so the loud parts sit near 1.
function rmsWindows(samples: Float32Array, sampleRate: number, rate: number): number[] {
  const step = sampleRate / rate;
  const out: number[] = [];
  const count = Math.ceil(samples.length / step - 1e-6);
  for (let w = 0; w < count; w++) {
    const i = Math.floor(w * step);
    let sum = 0;
    const end = Math.max(i + 1, Math.min(samples.length, Math.floor((w + 1) * step)));
    for (let j = i; j < end; j++) sum += samples[j] * samples[j];
    out.push(Math.sqrt(sum / (end - i)));
  }
  return out;
}

// Tempo from the autocorrelation of the onset curve, then the beat grid placed where onsets line up best.
// Prefers tempos near 110 BPM so a 60 BPM ballad isn't read as 120 or a 140 track as 70.
export function findBeats(onset: number[], frameRate: number, duration: number): { bpm: number; beats: number[]; strength: number[] } {
  const none = { bpm: 0, beats: [], strength: [] };
  if (duration < 3 || onset.length < frameRate * 3) return none;
  const mean = onset.reduce((a, b) => a + b, 0) / onset.length;
  const o = onset.map((v) => v - mean);
  const minLag = Math.floor((60 / 180) * frameRate);
  const maxLag = Math.ceil((60 / 70) * frameRate);
  const scores: number[] = [];
  let zero = 0;
  for (const v of o) zero += v * v;
  if (zero <= 1e-9) return none;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = lag; i < o.length; i++) s += o[i] * o[i - lag];
    const bpm = (60 * frameRate) / lag;
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 110) / 0.6, 2));
    scores.push((s / zero) * prior);
  }
  let best = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
  if (scores[best] < 0.02) return none;
  // Parabolic refinement between neighbouring lags.
  const a = scores[best - 1] ?? scores[best];
  const c = scores[best + 1] ?? scores[best];
  const denom = a - 2 * scores[best] + c;
  const lag = minLag + best + (denom ? (0.5 * (a - c)) / denom : 0);
  const period = lag;

  let phase = 0;
  let phaseScore = -Infinity;
  for (let off = 0; off < Math.ceil(period); off++) {
    let s = 0;
    for (let t = off; t < onset.length; t += period) s += onset[Math.round(t)] ?? 0;
    if (s > phaseScore) {
      phaseScore = s;
      phase = off;
    }
  }
  const beats: number[] = [];
  const raw: number[] = [];
  for (let t = phase; t < onset.length; t += period) {
    const i = Math.round(t);
    let peak = 0;
    for (let j = Math.max(0, i - 3); j <= Math.min(onset.length - 1, i + 3); j++) peak = Math.max(peak, onset[j]);
    beats.push(round2(t / frameRate));
    raw.push(peak);
  }
  const top = percentile(raw, 0.9) || 1;
  return { bpm: Math.round((60 * frameRate) / period), beats, strength: raw.map((v) => round2(Math.min(1, v / top))) };
}

// Everything but the lyric lines, from raw samples.
export function analyseSamples(samples: Float32Array, sampleRate: number) {
  const duration = samples.length / sampleRate;
  const env = rmsWindows(samples, sampleRate, ENVELOPE_RATE);
  const loud = percentile(env, 0.95) || 1;
  const envelope = env.map((v) => round2(Math.min(1, v / loud)));

  // Onsets: rises in log loudness at 100 frames a second.
  const frames = rmsWindows(samples, sampleRate, FRAME_RATE).map((v) => Math.log(1e-4 + v));
  const onset = frames.map((v, i) => (i ? Math.max(0, v - frames[i - 1]) : 0));
  const { bpm, beats, strength } = findBeats(onset, FRAME_RATE, duration);

  const bucket = samples.length / PEAK_BARS;
  const peaksRaw: number[] = [];
  for (let b = 0; b < PEAK_BARS; b++) {
    let m = 0;
    const end = Math.min(samples.length, Math.floor((b + 1) * bucket));
    for (let i = Math.floor(b * bucket); i < end; i++) m = Math.max(m, Math.abs(samples[i]));
    peaksRaw.push(m);
  }
  const peakTop = Math.max(...peaksRaw) || 1;
  const peaks = peaksRaw.map((v) => round2(v / peakTop));
  return { duration: round2(duration), envelope, bpm, beats, strength, peaks };
}

export interface AnalysisDeps {
  whisper?: { words(audio: Buffer): Promise<Word[]> };
  decode?: (file: string) => Promise<Float32Array>;
}

export const analysisPath = (songFile: string) => `${songFile}.analysis.json`;

async function compute(songFile: string, lyrics: string, deps: AnalysisDeps): Promise<SongAnalysis> {
  const samples = await (deps.decode ?? decodeMono)(songFile);
  const base = analyseSamples(samples, SAMPLE_RATE);
  const lines = singableLines(lyrics);
  let words: Word[] = [];
  if (deps.whisper && lines.length) {
    try {
      words = await deps.whisper.words(await readFile(songFile));
    } catch (err) {
      console.error("Player lyric timing fell back to even spacing:", (err as Error).message);
    }
  }
  return { version: ANALYSIS_VERSION, ...base, lines: timeLines(lines, words, base.duration), timing: words.length >= 3 ? "words" : "even" };
}

const inFlight = new Map<string, Promise<SongAnalysis>>();

// The cached analysis for a song file, worked out on first ask. Two asks at once share one run.
export async function getSongAnalysis(songFile: string, lyrics: string, deps: AnalysisDeps = {}): Promise<SongAnalysis> {
  const cache = analysisPath(songFile);
  try {
    const cached = JSON.parse(await readFile(cache, "utf8")) as SongAnalysis;
    if (cached.version === ANALYSIS_VERSION) return cached;
  } catch {
    // Not worked out yet.
  }
  const running = inFlight.get(songFile);
  if (running) return running;
  const job = compute(songFile, lyrics, deps)
    .then(async (a) => {
      const tmp = `${cache}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(a));
      await rename(tmp, cache);
      return a;
    })
    .finally(() => inFlight.delete(songFile));
  inFlight.set(songFile, job);
  return job;
}

// Loudness at a time, for drawing: linear between envelope values.
export function envelopeAt(envelope: number[], sec: number): number {
  const x = sec * ENVELOPE_RATE;
  const i = Math.floor(x);
  if (i < 0 || i >= envelope.length) return 0;
  const next = envelope[i + 1] ?? envelope[i];
  return envelope[i] + (next - envelope[i]) * (x - i);
}
