import { execFile } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// How the creator's own voice is processed. It stays their voice and in sync with their lips:
// "clear" cleans and levels it; "deeper" also lowers the pitch a little with formants kept, so it
// sounds fuller rather than robotic.
export const VOICES = ["natural", "clear", "deeper"] as const;
export type Voice = (typeof VOICES)[number];

const CLEAN = "highpass=f=70,afftdn=nf=-25";
const LEVEL = "acompressor=threshold=-20dB:ratio=3:attack=5:release=80:makeup=2,loudnorm=I=-14:TP=-1.5:LRA=9,aresample=48000";

export function voiceFilter(voice: Voice): string {
  switch (voice) {
    case "clear":
      return `${CLEAN},equalizer=f=220:t=q:w=1:g=-2,equalizer=f=3200:t=q:w=1.5:g=3,${LEVEL}`;
    case "deeper":
      return `${CLEAN},rubberband=pitch=0.89:formant=preserved,bass=g=3:f=110,equalizer=f=3000:t=q:w=1.5:g=2,${LEVEL}`;
    default:
      return "aresample=48000";
  }
}

// Sound effects are synthesised with FFmpeg, so they are ours: no licences, no attribution.
export const SOUNDS = {
  pop: { expr: "sin(2*PI*(500+900*exp(-t*40))*t)*exp(-t*28)*0.8", d: 0.18 },
  ding: { expr: "(sin(2*PI*1320*t)*exp(-t*6)+0.5*sin(2*PI*2640*t)*exp(-t*9))*0.45", d: 1.0 },
  boom: { expr: "sin(2*PI*(50+70*exp(-t*12))*t)*exp(-t*4)*0.95", d: 1.1 },
  tick: { expr: "sin(2*PI*2200*t)*exp(-t*90)*0.6", d: 0.06 },
  shimmer: { expr: "(sin(2*PI*2093*t)+sin(2*PI*2637*t)+sin(2*PI*3136*t))/3*exp(-t*3)*(0.6+0.4*sin(2*PI*14*t))*0.35", d: 1.2 },
  whoosh: { noise: true, d: 0.5 },
  stamp: { expr: "(sin(2*PI*(90+120*exp(-t*30))*t)*exp(-t*10)+0.3*sin(2*PI*180*t)*exp(-t*20))*0.9", d: 0.45 },
} as const;
export type Sound = keyof typeof SOUNDS;

export function soundArgs(sound: Sound, file: string): string[] {
  const s = SOUNDS[sound];
  if ("noise" in s) {
    return ["-y", "-v", "error", "-f", "lavfi", "-i", `anoisesrc=d=${s.d}:c=pink:a=0.5:r=48000`, "-af", "highpass=f=500,lowpass=f=4000,afade=t=in:d=0.3:curve=exp,afade=t=out:st=0.3:d=0.2", "-ac", "1", file];
  }
  return ["-y", "-v", "error", "-f", "lavfi", "-i", `aevalsrc='${s.expr}':s=48000:d=${s.d}`, "-ac", "1", file];
}

// Makes (once) the WAV for a sound effect in dir and returns its path.
export async function soundFile(sound: Sound, dir: string): Promise<string> {
  const file = path.join(dir, `${sound}.wav`);
  try {
    await access(file);
  } catch {
    await mkdir(dir, { recursive: true });
    await execFileAsync("ffmpeg", soundArgs(sound, file));
  }
  return file;
}

export interface Cue {
  sound: Sound;
  at: number;
  // 0-1, relative to the voice.
  volume?: number;
}

// One FFmpeg command: the processed voice (or silence) with every cue mixed in at its time.
export function mixArgs(o: { source: string | null; voice: Voice; durationSec: number; cues: Cue[]; files: Record<string, string>; output: string }): string[] {
  const used = [...new Set(o.cues.map((c) => c.sound))];
  const inputs = o.source ? ["-i", o.source] : ["-f", "lavfi", "-i", `anullsrc=r=48000:cl=mono:d=${o.durationSec.toFixed(3)}`];
  for (const s of used) inputs.push("-i", o.files[s]);
  const parts = [`[0:a]${o.source ? voiceFilter(o.voice) : "anull"},aformat=sample_rates=48000:channel_layouts=stereo[v]`];
  const labels = ["[v]"];
  // Each sound file is split so it can play at several times.
  used.forEach((s, i) => {
    const cues = o.cues.filter((c) => c.sound === s);
    const outs = cues.map((_, j) => `[s${i}_${j}]`);
    parts.push(`[${i + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,asplit=${cues.length}${outs.map((x) => x.replace("[", "[r")).join("")}`);
    cues.forEach((c, j) => {
      const ms = Math.max(0, Math.round(c.at * 1000));
      parts.push(`[rs${i}_${j}]adelay=${ms}|${ms},volume=${(c.volume ?? 0.5).toFixed(2)}${outs[j]}`);
      labels.push(outs[j]);
    });
  });
  parts.push(`${labels.join("")}amix=inputs=${labels.length}:duration=first:normalize=0,alimiter=limit=0.95,atrim=0:${o.durationSec.toFixed(3)}[out]`);
  return ["-y", "-v", "error", ...inputs, "-filter_complex", parts.join(";"), "-map", "[out]", "-c:a", "aac", "-b:a", "160k", o.output];
}

// Writes the final soundtrack, or returns null when the video stays silent.
export async function mixAudio(o: { source: string; hasAudio: boolean; voice: Voice; durationSec: number; cues: Cue[]; soundsDir: string; output: string }): Promise<string | null> {
  if (!o.hasAudio && !o.cues.length) return null;
  const files: Record<string, string> = {};
  for (const c of o.cues) files[c.sound] ??= await soundFile(c.sound, o.soundsDir);
  await execFileAsync("ffmpeg", mixArgs({ ...o, source: o.hasAudio ? o.source : null, files }), { maxBuffer: 1 << 20 });
  return o.output;
}
