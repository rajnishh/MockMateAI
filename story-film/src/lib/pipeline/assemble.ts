import type { Resolution } from "@/lib/providers/types";

export const FRAME_SIZE: Record<Resolution, { w: number; h: number }> = {
  "480p": { w: 480, h: 854 },
  "720p": { w: 720, h: 1280 },
};

export interface AssembleInput {
  clips: string[];
  narration: string[];
  // Without music the narration plays over silence.
  music?: string;
  clipSeconds: number;
  resolution: Resolution;
  watermark: boolean;
  output: string;
  // Pre-rendered caption images, each shown from start to end at height y.
  captions?: { file: string; start: number; end: number; y: number }[];
}

export const AI_LABEL = "Created with AI";

type CaptionOverlay = NonNullable<AssembleInput["captions"]>[number];

// Scales/crops one input to the 9:16 frame and trims it to its slot length.
function normaliseClip(input: number, w: number, h: number, seconds: number): string {
  return (
    `[${input}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=24,` +
    `trim=duration=${seconds},setpts=PTS-STARTPTS[v${input}]`
  );
}

// Chains caption overlays (inputs from firstInput on) and burns the AI label last.
function captionsAndLabel(filters: string[], video: string, firstInput: number, captions: CaptionOverlay[], h: number, watermark: boolean) {
  captions.forEach((c, i) => {
    const out = `[cap${i}]`;
    filters.push(`${video}[${firstInput + i}:v]overlay=x=0:y=${c.y}:enable='between(t,${c.start},${c.end})'${out}`);
    video = out;
  });
  // The AI label is always burned in (platform disclosure); the plan watermark is extra.
  const label = watermark ? `${AI_LABEL} · free plan` : AI_LABEL;
  filters.push(
    `${video}drawtext=text='${label}':fontcolor=white@0.85:fontsize=${Math.round(h / 45)}:` +
      `box=1:boxcolor=black@0.35:boxborderw=8:x=(w-text_w)/2:y=h-text_h-${Math.round(h / 20)}[vout]`,
  );
}

function encodeArgs(total: number, output: string): string[] {
  return [
    "-map", "[vout]",
    "-map", "[aout]",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-t", String(total),
    "-movflags", "+faststart",
    "-metadata", `comment=${AI_LABEL}`,
    output,
  ];
}

// Builds one ffmpeg invocation: normalise clips to 9:16, concat them, lay each
// shot's narration over its clip, duck music underneath, and burn the AI label.
export function buildAssembleArgs(input: AssembleInput): string[] {
  const n = input.clips.length;
  if (n === 0 || input.narration.length !== n) {
    throw new Error("Need one narration track per clip");
  }
  const { w, h } = FRAME_SIZE[input.resolution];
  const total = n * input.clipSeconds;
  const filters: string[] = [];

  for (let i = 0; i < n; i++) {
    filters.push(normaliseClip(i, w, h, input.clipSeconds));
    filters.push(
      `[${n + i}:a]aformat=sample_rates=44100:channel_layouts=stereo,apad,` +
        `atrim=duration=${input.clipSeconds},asetpts=PTS-STARTPTS[n${i}]`,
    );
  }
  const vLabels = Array.from({ length: n }, (_, i) => `[v${i}]`).join("");
  const nLabels = Array.from({ length: n }, (_, i) => `[n${i}]`).join("");
  filters.push(`${vLabels}concat=n=${n}:v=1:a=0[vcat]`);
  filters.push(`${nLabels}concat=n=${n}:v=0:a=1[narr]`);
  filters.push(
    `[${2 * n}:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.18,` +
      `atrim=duration=${total},asetpts=PTS-STARTPTS[mus]`,
  );
  filters.push(`[narr][mus]amix=inputs=2:duration=first:normalize=0[aout]`);
  // Caption images are the inputs after music (index 2n + 1 onwards).
  captionsAndLabel(filters, "[vcat]", 2 * n + 1, input.captions ?? [], h, input.watermark);

  return [
    "-y",
    ...input.clips.flatMap((c) => ["-i", c]),
    ...input.narration.flatMap((a) => ["-i", a]),
    ...(input.music
      ? ["-stream_loop", "-1", "-i", input.music]
      : ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"]),
    ...(input.captions ?? []).flatMap((c) => ["-i", c.file]),
    "-filter_complex", filters.join(";"),
    ...encodeArgs(total, input.output),
  ];
}

export interface MusicVideoAssembleInput {
  clips: string[];
  // Length of each clip's slot on the timeline, in seconds.
  durations: number[];
  song: string;
  resolution: Resolution;
  watermark: boolean;
  output: string;
  captions?: CaptionOverlay[];
}

// Music video: clips cut to their slots, the song as the only audio, lyric captions on top.
export function buildMusicVideoArgs(input: MusicVideoAssembleInput): string[] {
  const n = input.clips.length;
  if (n === 0 || input.durations.length !== n) throw new Error("Need one duration per clip");
  const { w, h } = FRAME_SIZE[input.resolution];
  const total = Math.round(input.durations.reduce((a, b) => a + b, 0) * 100) / 100;
  const filters = input.clips.map((_, i) => normaliseClip(i, w, h, input.durations[i]));
  filters.push(`${input.clips.map((_, i) => `[v${i}]`).join("")}concat=n=${n}:v=1:a=0[vcat]`);
  filters.push(`[${n}:a]aformat=sample_rates=44100:channel_layouts=stereo,atrim=duration=${total},asetpts=PTS-STARTPTS[aout]`);
  captionsAndLabel(filters, "[vcat]", n + 1, input.captions ?? [], h, input.watermark);
  return [
    "-y",
    ...input.clips.flatMap((c) => ["-i", c]),
    "-i", input.song,
    ...(input.captions ?? []).flatMap((c) => ["-i", c.file]),
    "-filter_complex", filters.join(";"),
    ...encodeArgs(total, input.output),
  ];
}
