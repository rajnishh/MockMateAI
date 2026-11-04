import { spawn } from "node:child_process";
import { beatSec, type WordTime } from "./script";

// Turns a spoken chant line into a sung one, for free: the TTS voice is cut into words (and two-syllable
// words into syllables) by loudness, then each piece is re-pitched onto a note of a short major-pentatonic
// tune and stretched to its eighth or quarter beat (TD-PSOLA, which keeps the voice's own timbre).
// Consonants keep their natural speed and the vowels are held, which is what makes it sound sung.
// Everything is deterministic and runs in TypeScript on the PCM.

export const SING_RATE = 24000;
// Like a singer, consonants come just before the beat so the vowel lands on it: every sung line starts with
// this much lead-in, and is placed this much early.
export const SING_LEAD = 0.08;

// Steps of the major pentatonic scale (do re mi sol la), in semitones above the tonic.
const PENTATONIC = [0, 2, 4, 7, 9];
const semis = (step: number) => PENTATONIC[((step % 5) + 5) % 5] + 12 * Math.floor(step / 5);

// Short kid-song shapes in pentatonic steps (0 = do, 5 = do an octave up). Lines take turns,
// call and answer: the "call" lines end open on sol, the "answer" lines and the last line come home to do.
const MOTIFS = [
  [2, 2, 3, 3, 4, 3, 2, 3],
  [4, 4, 3, 2, 1, 1, 2, 0],
  [0, 1, 2, 3, 2, 1, 2, 3],
  [5, 4, 3, 4, 3, 2, 1, 0],
];

export interface Note {
  word: number;
  // Seconds from the start of the line; starts are always on an eighth-note beat.
  start: number;
  end: number;
  midi: number;
}

export interface Melody {
  notes: Note[];
  words: WordTime[];
  // Seconds from the first note to the end of the last, a whole number of eighth notes.
  durationSec: number;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// Rough syllable count: vowel groups in Latin script, one per letter cluster in abugidas like Devanagari
// (डुबी = डु·बी), about one per two letters in Arabic.
export function syllables(word: string): number {
  const w = word.toLowerCase();
  if (/^[\p{Script=Latin}\p{N}'’-]+$/u.test(w)) return Math.max(1, (w.match(/[aeiouy]+/g) ?? []).length);
  const clusters = [...segmenter.segment(w)].map((s) => s.segment).filter((s) => /\p{L}/u.test(s));
  if (/\p{Script=Arabic}/u.test(w)) return Math.max(1, Math.round(clusters.length / 2));
  // Hindi drops the final "a" of a bare last consonant: डम is one syllable, ऊपर two.
  const bareEnd = clusters.length > 1 && /^\p{Script=Devanagari}$/u.test(clusters.at(-1)!) && /^[क-हक़-य़]$/u.test(clusters.at(-1)!);
  return Math.max(1, clusters.length - (bareEnd ? 1 : 0));
}

export const chantWords = (text: string) => text.split(/\s+/).filter(Boolean);

// The tune for one line: one note per word, two for words of two or more syllables. Short lines sing a
// note per quarter beat, long ones per eighth, and the last note is held twice as long.
export function planMelody(text: string, bpm: number, line: number, lineCount: number, tonic: number): Melody {
  const words = chantWords(text);
  const perWord = words.map((wd) => Math.min(2, syllables(wd)));
  const total = perWord.reduce((a, b) => a + b, 0);
  const unit = total <= 6 ? 2 : 1;
  const eighth = beatSec(bpm) / 2;
  const motif = MOTIFS[line % MOTIFS.length];
  const cadence = line === lineCount - 1 || line % 2 === 1 ? 0 : 3;
  const notes: Note[] = [];
  let k = 0;
  let at = 0;
  perWord.forEach((n, word) => {
    for (let j = 0; j < n; j++, k++) {
      const last = k === total - 1;
      const len = last ? unit * 2 : unit;
      notes.push({ word, start: at * eighth, end: (at + len) * eighth, midi: tonic + semis(last ? cadence : motif[k % motif.length]) });
      at += len;
    }
  });
  const timed = words.map((_, i) => {
    const mine = notes.filter((n) => n.word === i);
    return { start: mine[0].start, end: mine.at(-1)!.end };
  });
  return { notes, words: timed, durationSec: at * eighth };
}

// --- Pitch ---------------------------------------------------------------

const HOP = 240;
const MIN_HZ = 70;
const MAX_HZ = 500;

export interface PitchTrack {
  // Samples per period for each 10 ms frame (at SING_RATE), 0 where the voice is unvoiced or silent.
  periods: Float32Array;
  hop: number;
}

// YIN pitch detection, then a median of three to remove one-frame octave jumps.
export function trackPitch(x: Float32Array, sr = SING_RATE): PitchTrack {
  const win = Math.round(sr * 0.02);
  const minLag = Math.floor(sr / MAX_HZ);
  const maxLag = Math.ceil(sr / MIN_HZ);
  const frames = Math.ceil(x.length / HOP);
  const raw = new Float32Array(frames);
  const rms = rmsFrames(x, HOP);
  const loud = Math.max(...rms, 1e-9) * 0.06;
  const d = new Float64Array(maxLag + 1);
  for (let f = 0; f < frames; f++) {
    const s = f * HOP - (win >> 1);
    if (rms[f] < loud || s < 0 || s + win + maxLag >= x.length) continue;
    for (let tau = 1; tau <= maxLag; tau++) {
      let sum = 0;
      for (let j = 0; j < win; j++) {
        const diff = x[s + j] - x[s + j + tau];
        sum += diff * diff;
      }
      d[tau] = sum;
    }
    let run = 0;
    let found = 0;
    for (let tau = 1; tau <= maxLag; tau++) {
      run += d[tau];
      const cmnd = (d[tau] * tau) / (run || 1);
      if (tau >= minLag && cmnd < 0.2) {
        found = tau;
        // Walk down to the bottom of the dip.
        while (found < maxLag && (d[found + 1] * (found + 1)) / (run + d[found + 1]) < (d[found] * found) / run) {
          run += d[++found];
        }
        break;
      }
    }
    raw[f] = found;
  }
  const periods = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const a = raw[Math.max(0, f - 1)], b = raw[f], c = raw[Math.min(frames - 1, f + 1)];
    periods[f] = b === 0 ? 0 : [a || b, b, c || b].sort((p, q) => p - q)[1];
  }
  return { periods, hop: HOP };
}

export function medianHz(tracks: PitchTrack[], sr = SING_RATE): number {
  const hz = tracks.flatMap((t) => [...t.periods].filter((p) => p > 0).map((p) => sr / p)).sort((a, b) => a - b);
  return hz.length ? hz[hz.length >> 1] : 200;
}

const midiOf = (hz: number) => 69 + 12 * Math.log2(hz / 440);
const hzOf = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

// The tune's tonic: its middle (about 6 semitones up) sits a little above the voice's own pitch,
// a touch brighter for a kids' song; PSOLA keeps the voice's timbre, so it doesn't sound chipmunky.
export const tonicFor = (voiceHz: number) => Math.round(midiOf(voiceHz)) - 3;

function rmsFrames(x: Float32Array, hop: number): Float32Array {
  const out = new Float32Array(Math.ceil(x.length / hop));
  for (let f = 0; f < out.length; f++) {
    let sum = 0;
    const end = Math.min(x.length, (f + 1) * hop);
    for (let i = f * hop; i < end; i++) sum += x[i] * x[i];
    out[f] = Math.sqrt(sum / Math.max(1, end - f * hop));
  }
  return out;
}

// Glottal pulses in the voiced parts, one per period, on the waveform's peaks: PSOLA grains are cut here.
function pitchMarks(x: Float32Array, track: PitchTrack): number[] {
  const marks: number[] = [];
  const periodAt = (i: number) => track.periods[Math.min(track.periods.length - 1, Math.floor(i / track.hop))] ?? 0;
  let i = 0;
  while (i < x.length) {
    const p = periodAt(i);
    if (!p) {
      i += track.hop >> 2;
      continue;
    }
    // Inside a voiced run the next pulse is about one period on; at its start, look over a whole period.
    const prev = marks.at(-1);
    const continuing = prev !== undefined && i - prev <= 1.5 * p;
    const lo = Math.max(0, Math.round(continuing ? i - p * 0.25 : i));
    const hi = Math.min(x.length, Math.round(continuing ? i + p * 0.25 : i + p));
    let best = lo;
    for (let j = lo; j < hi; j++) if (x[j] > x[best]) best = j;
    if (prev === undefined || best > prev + p * 0.5) marks.push(best);
    i = best + Math.round(p);
  }
  return marks;
}

// --- Cutting the line into notes -------------------------------------------

// Where each word's sound is in the TTS audio: the loud part split in proportion to the words' syllables,
// each cut moved to the quietest moment nearby (the gap between words).
export function splitPieces(x: Float32Array, weights: number[], sr = SING_RATE): [number, number][] {
  const hop = Math.round(sr * 0.01);
  const rms = rmsFrames(x, hop);
  const peak = Math.max(...rms, 1e-9);
  let r0 = rms.findIndex((v) => v > peak * 0.1);
  let r1 = rms.length - 1 - [...rms].reverse().findIndex((v) => v > peak * 0.1);
  if (r0 < 0) [r0, r1] = [0, rms.length - 1];
  const total = weights.reduce((a, b) => a + b, 0);
  const avg = (r1 - r0) / weights.length;
  const cuts = [r0];
  let acc = 0;
  for (let k = 0; k < weights.length - 1; k++) {
    acc += weights[k];
    const ideal = Math.round(r0 + ((r1 - r0) * acc) / total);
    const lo = Math.max(cuts.at(-1)! + 3, Math.round(ideal - avg * 0.4));
    const hi = Math.min(r1 - 3 * (weights.length - 1 - k), Math.round(ideal + avg * 0.4));
    let best = Math.min(Math.max(ideal, lo), Math.max(lo, hi));
    for (let f = lo; f <= hi; f++) if (rms[f] < rms[best]) best = f;
    cuts.push(best);
  }
  cuts.push(r1 + 1);
  return weights.map((_, k) => [cuts[k] * hop, Math.min(x.length, cuts[k + 1] * hop)]);
}

// --- Singing ---------------------------------------------------------------

interface Voice {
  detuneCents: number;
  delaySec: number;
  gain: number;
  vibratoPhase: number;
}

// The lead voice plus a quieter double a little sharp and late, like two kids singing together.
const VOICES: Voice[] = [
  { detuneCents: 0, delaySec: 0, gain: 1, vibratoPhase: 0 },
  { detuneCents: 12, delaySec: 0.018, gain: 0.45, vibratoPhase: 1.7 },
];

// Sings one line: returns mono PCM at SING_RATE, SING_LEAD + melody.durationSec long plus a short tail.
// Pass the line's pitch track if it's already known (tracking is the slow part).
export function singLine(x: Float32Array, melody: Melody, sr = SING_RATE, track = trackPitch(x, sr)): Float32Array {
  const marks = pitchMarks(x, track);
  const energy = rmsFrames(x, track.hop);
  const periodAt = (i: number) => track.periods[Math.min(track.periods.length - 1, Math.max(0, Math.floor(i / track.hop)))] ?? 0;
  const nearestMark = (s: number) => {
    let lo = 0, hi = marks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (marks[mid] < s) lo = mid + 1;
      else hi = mid;
    }
    return lo > 0 && Math.abs(marks[lo - 1] - s) < Math.abs(marks[lo] - s) ? marks[lo - 1] : marks[lo];
  };

  // One source piece per note: words with two notes are split again at their quietest middle.
  const words = new Map<number, number>();
  for (const n of melody.notes) words.set(n.word, (words.get(n.word) ?? 0) + 1);
  const wordPieces = splitPieces(x, [...words.values()].map((n) => n + 0.5), sr);
  const pieces: [number, number][] = [];
  [...words.values()].forEach((n, w) => {
    const [a, b] = wordPieces[w];
    if (n === 1) pieces.push([a, b]);
    else pieces.push(...splitPieces(x.subarray(a, b), [1, 1], sr).map(([p, q]): [number, number] => [a + p, a + q]));
  });

  const tail = Math.round(sr * 0.25);
  const lead = Math.round(SING_LEAD * sr);
  const out = new Float32Array(lead + Math.ceil(melody.durationSec * sr) + tail);
  const unvoicedHop = Math.round(sr * 0.005);
  for (const voice of VOICES) {
    melody.notes.forEach((note, k) => {
      const [a0, a1] = pieces[k];
      const last = k === melody.notes.length - 1;
      const len = Math.round((note.end - note.start) * sr * (last ? 1 : 0.92));
      const prevHz = hzOf(melody.notes[k - 1]?.midi ?? note.midi);
      const hz = hzOf(note.midi + voice.detuneCents / 100);
      // Consonants (and the murmur before Hindi's voiced stops) play at their own speed; only the vowel,
      // the loud voiced middle of the piece, is held.
      const loudAt = (i: number) => (periodAt(i) ? energy[Math.min(energy.length - 1, Math.floor(i / track.hop))] : 0);
      let top = 0;
      for (let i = a0; i < a1; i += track.hop) top = Math.max(top, loudAt(i));
      let v0 = a0, v1 = a1;
      while (v0 < a1 && loudAt(v0) < top * 0.5) v0 += track.hop;
      while (v1 > v0 && loudAt(v1 - 1) < top * 0.5) v1 -= track.hop;
      const pre = Math.min(v0 - a0, len * 0.4);
      const post = Math.min(a1 - v1, len * 0.25);
      const mid = Math.max(1, len - pre - post);
      const o0 = lead + Math.round((note.start + voice.delaySec) * sr - Math.min(pre, lead));
      const source = (t: number) =>
        t < pre ? a0 + t : t < pre + mid ? v0 + ((t - pre) / mid) * Math.max(1, v1 - v0) : v1 + (t - pre - mid);
      const env = (t: number) => Math.min(1, t / (sr * 0.008), (len - t) / (sr * (last ? 0.12 : 0.03)));
      let t = 0;
      while (t < len) {
        const s = Math.min(x.length - 1, source(t));
        const p = periodAt(s);
        const sec = t / sr;
        if (p) {
          // A quick glide in from the last note, then a gentle vibrato on held notes.
          const glide = Math.min(1, sec / 0.035);
          const vib = sec > 0.15 ? 0.25 * Math.sin(2 * Math.PI * 5.5 * sec + voice.vibratoPhase) : 0;
          const f = (prevHz + (hz - prevHz) * glide) * 2 ** (vib / 12);
          const target = sr / f;
          const m = marks.length ? nearestMark(s) : Math.round(s);
          const at = Math.abs(m - s) < p ? m : Math.round(s);
          addGrain(out, x, at, Math.round(p), o0 + Math.round(t), voice.gain * env(t) * Math.min(1, target / p));
          t += target;
        } else {
          addGrain(out, x, Math.round(s), unvoicedHop, o0 + Math.round(t), voice.gain * env(t));
          t += unvoicedHop;
        }
      }
    });
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] *= 0.9 / peak;
  return out;
}

// A Hann-windowed grain of two periods around `at`, added centred on `to`.
function addGrain(out: Float32Array, x: Float32Array, at: number, half: number, to: number, gain: number) {
  for (let j = -half; j < half; j++) {
    const src = at + j;
    const dst = to + j;
    if (src < 0 || src >= x.length || dst < 0 || dst >= out.length) continue;
    out[dst] += gain * x[src] * 0.5 * (1 + Math.cos((Math.PI * j) / half));
  }
}

// --- Audio files -------------------------------------------------------------

// Any audio file → mono float PCM at SING_RATE.
export function decodePcm(audio: Buffer, sr = SING_RATE): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", ["-v", "error", "-i", "pipe:0", "-f", "f32le", "-ac", "1", "-ar", String(sr), "pipe:1"]);
    const chunks: Buffer[] = [];
    let stderr = "";
    ff.stdout.on("data", (d: Buffer) => chunks.push(d));
    ff.stderr.on("data", (d) => (stderr += d));
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg could not read the voice: ${stderr.slice(-500)}`));
      const buf = Buffer.concat(chunks);
      resolve(new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length - (buf.length % 4))));
    });
    ff.stdin.on("error", () => undefined);
    ff.stdin.end(audio);
  });
}

// Sings every chant line in one key, chosen from the voice's own pitch across all the lines.
export function singChant(lines: Float32Array[], script: { bpm: number; lines: { text: string }[] }): { audio: Float32Array[]; melodies: Melody[] } {
  const tracks = lines.map((x) => trackPitch(x));
  const tonic = tonicFor(medianHz(tracks));
  const melodies = script.lines.map((l, i) => planMelody(l.text, script.bpm, i, script.lines.length, tonic));
  return { audio: lines.map((x, i) => singLine(x, melodies[i], SING_RATE, tracks[i])), melodies };
}
