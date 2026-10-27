import type { Resolution } from "@/lib/providers/types";

export const FRAME_SIZE: Record<Resolution, { w: number; h: number }> = {
  "480p": { w: 480, h: 854 },
  "720p": { w: 720, h: 1280 },
};

export interface AssembleInput {
  clips: string[];
  narration: string[];
  music: string;
  clipSeconds: number;
  resolution: Resolution;
  watermark: boolean;
  output: string;
}

export const AI_LABEL = "Created with AI";

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
    filters.push(
      `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=24,` +
        `trim=duration=${input.clipSeconds},setpts=PTS-STARTPTS[v${i}]`,
    );
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
  // The AI label is always burned in (platform disclosure); the plan watermark is extra.
  const label = input.watermark ? `${AI_LABEL} · free plan` : AI_LABEL;
  filters.push(
    `[vcat]drawtext=text='${label}':fontcolor=white@0.85:fontsize=${Math.round(h / 45)}:` +
      `box=1:boxcolor=black@0.35:boxborderw=8:x=(w-text_w)/2:y=h-text_h-${Math.round(h / 20)}[vout]`,
  );

  return [
    "-y",
    ...input.clips.flatMap((c) => ["-i", c]),
    ...input.narration.flatMap((a) => ["-i", a]),
    "-stream_loop", "-1", "-i", input.music,
    "-filter_complex", filters.join(";"),
    "-map", "[vout]",
    "-map", "[aout]",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-t", String(total),
    "-movflags", "+faststart",
    "-metadata", `comment=${AI_LABEL}`,
    input.output,
  ];
}
