// A dhol rhythm synthesised in code: the deep "dhum" (bass head), the sharp "tak" (treble head)
// and a soft shaker, in a bhangra-style pattern. No music model or sample files needed.

export const SAMPLE_RATE = 48000;

// Eighth notes in one bar of 4/4: D = dhum, t = tak, d = soft dhum, . = rest.
const PATTERN = "D.tDt.Dt";
const FILL = "DtDtDtDD";

type Hit = (out: Float32Array, at: number, gain: number, rand: () => number) => void;

// Pitch falls fast from 140 Hz to about 55 Hz: the boom of the dhol's bass side.
const dhum: Hit = (out, at, gain) => {
  const len = Math.floor(SAMPLE_RATE * 0.45);
  let phase = 0;
  for (let i = 0; i < len && at + i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const freq = 55 + 85 * Math.exp(-t * 18);
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    const env = Math.exp(-t * 7) * Math.min(1, i / 48);
    out[at + i] += gain * env * (Math.sin(phase) + 0.25 * Math.sin(phase * 2));
  }
};

// A short bright crack: a little tuned ring plus a burst of noise.
const tak: Hit = (out, at, gain, rand) => {
  const len = Math.floor(SAMPLE_RATE * 0.12);
  let lp = 0;
  for (let i = 0; i < len && at + i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const noise = rand() * 2 - 1;
    // A one-pole high-pass keeps the noise crisp rather than hissy.
    const hp = noise - lp;
    lp += 0.35 * (noise - lp);
    const env = Math.exp(-t * 45);
    out[at + i] += gain * env * (0.55 * hp + 0.45 * Math.sin(2 * Math.PI * 520 * t));
  }
};

const shaker: Hit = (out, at, gain, rand) => {
  const len = Math.floor(SAMPLE_RATE * 0.05);
  for (let i = 0; i < len && at + i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    out[at + i] += gain * Math.exp(-t * 90) * (rand() * 2 - 1);
  }
};

// Mono 16-bit WAV of the beat for durationSec seconds. The last bar is a fill into the finale.
export function dholBeat(bpm: number, durationSec: number, seed = 7): Buffer {
  const total = Math.ceil(durationSec * SAMPLE_RATE);
  const out = new Float32Array(total);
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const eighth = (60 / bpm / 2) * SAMPLE_RATE;
  const bars = Math.ceil(durationSec / ((60 / bpm) * 4));
  for (let bar = 0; bar < bars; bar++) {
    const pattern = bar === bars - 2 ? FILL : PATTERN;
    for (let k = 0; k < 8; k++) {
      const at = Math.round((bar * 8 + k) * eighth);
      if (at >= total) break;
      shaker(out, at, k % 2 ? 0.08 : 0.12, rand);
      const hit = pattern[k];
      if (hit === "D") dhum(out, at, k === 0 ? 0.9 : 0.75, rand);
      else if (hit === "d") dhum(out, at, 0.45, rand);
      else if (hit === "t") tak(out, at, 0.7, rand);
    }
  }
  // Soft-clip so overlapping hits never crackle, and fade the very end.
  const fade = Math.floor(SAMPLE_RATE * 0.3);
  const pcm = Buffer.alloc(44 + total * 2);
  for (let i = 0; i < total; i++) {
    const tail = i > total - fade ? (total - i) / fade : 1;
    pcm.writeInt16LE(Math.round(Math.tanh(out[i] * 1.2) * tail * 32000), 44 + i * 2);
  }
  writeWavHeader(pcm, total, SAMPLE_RATE);
  return pcm;
}

// Mono 16-bit WAV of float samples (-1..1).
export function encodeWav(samples: Float32Array, rate: number): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32000), 44 + i * 2);
  writeWavHeader(buf, samples.length, rate);
  return buf;
}

function writeWavHeader(buf: Buffer, samples: number, rate: number) {
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples * 2, 40);
}
