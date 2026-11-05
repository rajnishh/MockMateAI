// Finds the beat and the downbeats (the "1" of each bar) of a song, so music video shots cut on
// the music the way a human editor would. No model does this; it's a small onset-strength tempo
// tracker that runs on mono PCM decoded by ffmpeg.
import { readFile } from "node:fs/promises";

export interface BeatGrid {
  bpm: number;
  // Seconds from the start of the song.
  beats: number[];
  downbeats: number[];
}

export const PCM_RATE = 11025;
const HOP = 256;
const WIN = 1024;
const FPS = PCM_RATE / HOP;
const ONSET_LAG = WIN / PCM_RATE;
const MIN_BPM = 70;
const MAX_BPM = 180;
// Pop and Bollywood mostly sit near here; ties between half and double tempo lean towards it.
const PREFERRED_BPM = 110;

// ffmpeg arguments that decode any song to raw mono float PCM at PCM_RATE.
export function pcmArgs(input: string, output: string): string[] {
  return ["-y", "-i", input, "-vn", "-ac", "1", "-ar", String(PCM_RATE), "-f", "f32le", output];
}

export async function readPcm(file: string): Promise<Float32Array> {
  const buf = await readFile(file);
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength - (buf.byteLength % 4)));
}

// Half-wave rectified rise in log energy per frame: high where a drum or note starts.
export function onsetEnvelope(pcm: Float32Array): Float32Array {
  const frames = Math.max(0, Math.floor((pcm.length - WIN) / HOP) + 1);
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    // A first difference emphasises the high, percussive part of the sound.
    for (let i = f * HOP + 1; i < f * HOP + WIN; i++) {
      const d = pcm[i] - pcm[i - 1];
      sum += d * d;
    }
    energy[f] = Math.log1p(1000 * (sum / WIN));
  }
  const env = new Float32Array(frames);
  for (let f = 1; f < frames; f++) env[f] = Math.max(0, energy[f] - energy[f - 1]);
  // Remove the slowly moving average so loud sections don't dominate.
  const out = new Float32Array(frames);
  const half = Math.round(FPS / 2);
  let acc = 0;
  for (let f = 0; f < frames + half; f++) {
    if (f < frames) acc += env[f];
    if (f - 2 * half - 1 >= 0) acc -= env[f - 2 * half - 1];
    const c = f - half;
    if (c >= 0 && c < frames) out[c] = Math.max(0, env[c] - acc / (2 * half + 1));
  }
  return out;
}

// How well a beat grid of this period (in frames) lands on onsets, at its best phase. Errors in
// the period add up over the song, so this pins the tempo far more finely than autocorrelation.
function gridFit(env: Float32Array, period: number): { score: number; phase: number } {
  let best = { score: -1, phase: 0 };
  for (let p = 0; p < period; p++) {
    let s = 0;
    let n = 0;
    for (let t = p; t < env.length; t += period) {
      const f = Math.round(t);
      // A frame either side, so a slightly early or late hit still counts.
      s += Math.max(env[f - 1] ?? 0, env[f] ?? 0, env[f + 1] ?? 0);
      n++;
    }
    const score = n ? s / n : 0;
    if (score > best.score) best = { score, phase: p };
  }
  return best;
}

export function detectBeats(pcm: Float32Array, durationSec: number, hintBpm?: number): BeatGrid {
  const env = onsetEnvelope(pcm);
  let bpm = hintBpm && hintBpm >= 50 && hintBpm <= 220 ? hintBpm : 0;
  const strength = env.reduce((a, b) => a + b, 0);
  if (!bpm) {
    if (strength < 1e-3) bpm = 120;
    else {
      let best = -1;
      for (let b = MIN_BPM; b <= MAX_BPM; b += 0.25) {
        // Weighted towards the usual tempo so the half/double-time pick is sensible.
        const weight = Math.exp((-0.5 * Math.log2(b / PREFERRED_BPM) ** 2) / 0.5 ** 2);
        const s = gridFit(env, (60 / b) * FPS).score * weight;
        if (s > best) {
          best = s;
          bpm = b;
        }
      }
    }
  }
  const period = (60 / bpm) * FPS;
  const frames: number[] = [];
  // A hit first shows up in the frame whose window starts WIN samples before it.
  for (let f = gridFit(env, period).phase; f / FPS + ONSET_LAG < durationSec; f += period) frames.push(f);
  const beats = frames.map((f) => round(f / FPS + ONSET_LAG));
  // The downbeat is the beat of the bar with the strongest onsets.
  let bar = 0;
  let bestBar = -1;
  for (let o = 0; o < 4; o++) {
    let s = 0;
    for (let i = o; i < frames.length; i += 4) s += env[Math.round(frames[i])] ?? 0;
    if (s > bestBar) {
      bestBar = s;
      bar = o;
    }
  }
  const downbeats = beats.filter((_, i) => i % 4 === bar);
  return { bpm, beats, downbeats };
}

// An even grid, for when the song couldn't be decoded.
export function evenGrid(durationSec: number, bpm = 120): BeatGrid {
  const beats: number[] = [];
  for (let t = 0; t < durationSec; t += 60 / bpm) beats.push(round(t));
  return { bpm, beats, downbeats: beats.filter((_, i) => i % 4 === 0) };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
