import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

// The Studio's Mix tab: stems from Demucs, a mixer over them, and free ffmpeg sound presets.
// Stems and previews live as files next to the song, never in the database.

export const STEMS = ["vocals", "drums", "bass", "other"] as const;
export type StemName = (typeof STEMS)[number];

export const STEM_LABELS: Record<StemName, string> = { vocals: "Vocals", drums: "Drums", bass: "Bass", other: "Music" };

export const SOUND_PRESETS = [
  { id: "master", label: "Studio master", help: "Loud and clear, ready for Reels (-14 LUFS)." },
  { id: "bass", label: "Bass boost", help: "More low end for phone speakers and cars." },
  { id: "hall", label: "Hall reverb", help: "Sung in a big hall." },
  { id: "lofi", label: "Lo-fi tape", help: "Warm, wobbly and a bit dusty." },
  { id: "8d", label: "8D audio", help: "Moves around your head. Best on headphones." },
  { id: "slowed", label: "Slowed + reverb", help: "Slower, lower and dreamy." },
] as const;
export type SoundPreset = (typeof SOUND_PRESETS)[number]["id"];
const PRESET_IDS = SOUND_PRESETS.map((p) => p.id) as [SoundPreset, ...SoundPreset[]];

// Preset previews play this much of the song, so they render in well under a second.
export const PREVIEW_SEC = 30;
// Bars in a waveform: enough for a phone-wide drag target, small enough to send with the song.
export const PEAK_BINS = 160;
// Gains per stem: 0 is muted, 1 as separated, up to twice as loud.
export const MAX_GAIN = 2;

export const mixRequestSchema = z
  .object({
    gains: z.partialRecord(z.enum(STEMS), z.number().finite().min(0).max(MAX_GAIN)).optional(),
    preset: z.enum(PRESET_IDS).optional(),
  })
  .refine((m) => m.preset || (m.gains && Object.keys(m.gains).length), { message: "Change the mix or pick a sound first" })
  // Stems left out stay as they are.
  .refine((m) => !m.gains || STEMS.some((s) => (m.gains![s] ?? 1) > 0), { message: "Unmute at least one part", path: ["gains"] });

export type MixRequest = z.infer<typeof mixRequestSchema>;

export function isSoundPreset(id: string): id is SoundPreset {
  return (PRESET_IDS as string[]).includes(id);
}

// A short pink-noise tail convolved with the song: a real-sounding room, no impulse files to ship.
// The seed keeps every render of a preset the same.
function reverb(input: string, output: string, seconds: number, wet: number): string {
  return [
    `[${input}]asplit[${input}d][${input}w]`,
    `anoisesrc=d=${seconds}:c=pink:r=44100:a=0.6:seed=7,afade=t=out:st=0:d=${seconds}:curve=exp,aformat=channel_layouts=stereo[${input}ir]`,
    `[${input}w][${input}ir]afir=dry=10:wet=10[${input}wet]`,
    `[${input}d][${input}wet]amix=inputs=2:weights='1 ${wet}':normalize=0,alimiter=limit=0.9:level=false[${output}]`,
  ].join(";");
}

// The filter graph from [input] to [output] for one preset.
export function presetFilter(preset: SoundPreset, input: string, output: string): string {
  const pre = `[${input}]aresample=44100,aformat=channel_layouts=stereo`;
  switch (preset) {
    case "master":
      return `${pre},loudnorm=I=-14:TP=-1.2:LRA=11,aresample=44100,alimiter=limit=0.87:level=false[${output}]`;
    case "bass":
      return `${pre},bass=g=8:f=90:w=0.7,alimiter=limit=0.9:level=false[${output}]`;
    case "hall":
      return `${pre}[r];${reverb("r", output, 2.4, 0.5)}`;
    case "lofi":
      return `${pre},highpass=f=150,lowpass=f=3800,vibrato=f=0.6:d=0.08,acrusher=bits=10:mix=0.2:mode=log,volume=0.9[${output}]`;
    case "8d":
      return `${pre},apulsator=hz=0.125:amount=0.9[p];${reverb("p", output, 1.2, 0.25)}`;
    case "slowed":
      return `[${input}]asetrate=44100*0.85,aresample=44100,aformat=channel_layouts=stereo[r];${reverb("r", output, 2.6, 0.55)}`;
  }
}

// How a preset changes the length: only slowed + reverb does.
export function presetLength(preset: SoundPreset | undefined, sec: number): number {
  return preset === "slowed" ? sec / 0.85 : sec;
}

export interface MixInput {
  // The song itself, used when no stem gains are given.
  songFile: string;
  // Stem files with their gains; when set, the song is rebuilt from them.
  stems?: { file: string; gain: number }[];
  preset?: SoundPreset;
  output: string;
  // Render only this many seconds (a preview).
  previewSec?: number;
}

const n = (x: number) => Number(x.toFixed(3));

export function mixArgs(m: MixInput): string[] {
  const clip = m.previewSec ? ["-t", String(n(m.previewSec))] : [];
  const sources = m.stems?.filter((s) => s.gain > 0) ?? [];
  const inputs = sources.length ? sources.flatMap((s) => [...clip, "-i", s.file]) : [...clip, "-i", m.songFile];
  const graph: string[] = [];
  let last = "0:a";
  if (sources.length) {
    sources.forEach((s, i) => graph.push(`[${i}:a]aresample=44100,aformat=channel_layouts=stereo,volume=${n(s.gain)}[s${i}]`));
    graph.push(`${sources.map((_, i) => `[s${i}]`).join("")}amix=inputs=${sources.length}:normalize=0:duration=longest[mix]`);
    last = "mix";
  }
  if (m.preset) {
    graph.push(presetFilter(m.preset, last, "out"));
    last = "out";
  } else if (sources.length) {
    // Turning stems up can clip; a limiter keeps it clean.
    graph.push(`[${last}]alimiter=limit=0.95:level=false[out]`);
    last = "out";
  }
  return [
    "-y",
    "-loglevel", "error",
    ...inputs,
    ...(graph.length ? ["-filter_complex", graph.join(";"), "-map", `[${last}]`] : []),
    "-c:a", "libmp3lame", "-q:a", "2",
    m.output,
  ];
}

// Gains only for stems that changed from 1, so an untouched mixer saves just the preset.
export function changedGains(gains: Partial<Record<StemName, number>> | undefined): Partial<Record<StemName, number>> | undefined {
  if (!gains) return undefined;
  const changed = Object.fromEntries(Object.entries(gains).filter(([, g]) => Math.abs(g! - 1) > 0.01));
  return Object.keys(changed).length ? changed : undefined;
}

export function mixTitle(title: string, m: MixRequest): string {
  const base = title.replace(/ \((mix|[^()]*sound)\)$/, "");
  const preset = m.preset && SOUND_PRESETS.find((p) => p.id === m.preset)!.label.toLowerCase();
  return `${base} (${changedGains(m.gains) ? "mix" : `${preset} sound`})`.slice(0, 80);
}

// ---- Files next to the song ----

export function stemsDir(songFile: string, songId: string): string {
  return path.join(path.dirname(songFile), `${songId}-stems`);
}

export function stemFile(dir: string, stem: StemName): string {
  return path.join(dir, `${stem}.mp3`);
}

export function previewFile(songFile: string, songId: string, preset: SoundPreset): string {
  return path.join(path.dirname(songFile), `${songId}-fx`, `${preset}.mp3`);
}

export function peaksFile(songFile: string): string {
  return `${songFile}.peaks.json`;
}

export type StemsStatus = "none" | "running" | "ready" | "failed";
export interface StemsState {
  status: StemsStatus;
  error?: string;
  // When separation started, so a crashed job doesn't block the song forever.
  startedAt?: string;
}

// A separation older than this is treated as lost and can be started again.
const STALE_MS = 15 * 60 * 1000;

export async function readStemsState(dir: string, now = Date.now()): Promise<StemsState> {
  const raw = await readFile(path.join(dir, "state.json"), "utf8").catch(() => null);
  if (!raw) return { status: "none" };
  const state = JSON.parse(raw) as StemsState;
  if (state.status === "running" && state.startedAt && now - Date.parse(state.startedAt) > STALE_MS) {
    return { status: "failed", error: "Splitting took too long. Try again." };
  }
  return state;
}

export async function writeStemsState(dir: string, state: StemsState): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "state.json"), JSON.stringify(state));
}

export async function clearStems(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

// ---- Waveform ----

// ffmpeg decodes the song to 8 kHz mono 16-bit samples; each bin keeps its loudest sample.
export function peaksArgs(input: string, output: string): string[] {
  return ["-y", "-loglevel", "error", "-i", input, "-ac", "1", "-ar", "8000", "-f", "s16le", "-acodec", "pcm_s16le", output];
}

export function computePeaks(pcm: Buffer, bins = PEAK_BINS): number[] {
  const samples = Math.floor(pcm.length / 2);
  if (!samples) return Array(bins).fill(0);
  const per = samples / bins;
  const raw = Array.from({ length: bins }, (_, b) => {
    let max = 0;
    const end = Math.min(samples, Math.floor((b + 1) * per));
    // Every 4th sample is plenty for a bar's height.
    for (let i = Math.floor(b * per); i < end; i += 4) max = Math.max(max, Math.abs(pcm.readInt16LE(i * 2)));
    return max / 32768;
  });
  // Scaled to the loudest bar so quiet songs still draw a full waveform.
  const top = Math.max(...raw, 1e-6);
  return raw.map((v) => Math.round((v / top) * 1000) / 1000);
}
