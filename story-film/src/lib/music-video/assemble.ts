// Puts a music video together: shots cut on downbeats, the song as the only sound, lyric
// captions, and for lyric videos big words in the middle and a flash on every downbeat.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { AI_LABEL, FRAME_SIZE } from "@/lib/pipeline/assemble";
import { captionFont, type Cue, registerFonts } from "@/lib/pipeline/captions";
import type { Resolution } from "@/lib/providers/types";

export interface CaptionOverlay {
  file: string;
  start: number;
  end: number;
  y: number;
}

export interface MusicVideoCut {
  clips: string[];
  durations: number[];
  song: string;
  resolution: Resolution;
  watermark: boolean;
  output: string;
  captions?: CaptionOverlay[];
  // Downbeats (seconds) that get a short bright flash.
  flashes?: number[];
}

const FLASH_SEC = 0.09;

export function buildMusicVideoCutArgs(input: MusicVideoCut): string[] {
  const n = input.clips.length;
  if (n === 0 || input.durations.length !== n) throw new Error("Need one duration per clip");
  const { w, h } = FRAME_SIZE[input.resolution];
  const total = Math.round(input.durations.reduce((a, b) => a + b, 0) * 100) / 100;
  const f: string[] = input.clips.map(
    (_, i) =>
      `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=24,` +
      // A clip shorter than its slot holds its last frame rather than leaving a gap.
      `tpad=stop_mode=clone:stop_duration=${input.durations[i]},trim=duration=${input.durations[i]},setpts=PTS-STARTPTS[v${i}]`,
  );
  f.push(`${input.clips.map((_, i) => `[v${i}]`).join("")}concat=n=${n}:v=1:a=0[vcat]`);
  f.push(`[${n}:a]aformat=sample_rates=44100:channel_layouts=stereo,apad,atrim=duration=${total},asetpts=PTS-STARTPTS[aout]`);
  let video = "[vcat]";
  const flashes = (input.flashes ?? []).filter((t) => t > 0 && t < total);
  if (flashes.length) {
    const when = flashes.map((t) => `between(t,${t},${Math.round((t + FLASH_SEC) * 1000) / 1000})`).join("+");
    f.push(`${video}eq=brightness=0.14:saturation=1.3:enable='${when}'[flash]`);
    video = "[flash]";
  }
  (input.captions ?? []).forEach((c, i) => {
    f.push(`${video}[${n + 1 + i}:v]overlay=x=0:y=${c.y}:enable='between(t,${c.start},${c.end})'[cap${i}]`);
    video = `[cap${i}]`;
  });
  const label = [AI_LABEL, input.watermark ? "Made with Reelkar · free plan" : ""].filter(Boolean).join(" · ");
  f.push(
    `${video}drawtext=text='${label}':fontcolor=white@0.85:fontsize=${Math.round(h / 45)}:` +
      `box=1:boxcolor=black@0.35:boxborderw=8:x=(w-text_w)/2:y=h-text_h-${Math.round(h / 20)}[vout]`,
  );
  return [
    "-y",
    ...input.clips.flatMap((c) => ["-i", c]),
    "-i", input.song,
    ...(input.captions ?? []).flatMap((c) => ["-i", c.file]),
    "-filter_complex", f.join(";"),
    "-map", "[vout]",
    "-map", "[aout]",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-t", String(total),
    "-movflags", "+faststart",
    "-metadata", `comment=${AI_LABEL}`,
    input.output,
  ];
}

// Lyric video words: big, centred, in Masala Pop yellow with a plum outline.
export async function renderBigLyrics(cues: Cue[], resolution: Resolution, fontsDir: string, outDir: string): Promise<CaptionOverlay[]> {
  registerFonts(fontsDir);
  const { w, h } = FRAME_SIZE[resolution];
  const boxH = Math.round(h / 3.2);
  const maxWidth = w * 0.86;
  const out: CaptionOverlay[] = [];
  for (const [i, cue] of cues.entries()) {
    const canvas = createCanvas(w, boxH);
    const ctx = canvas.getContext("2d");
    const { family, rtl } = captionFont(cue.text);
    let size = Math.round(h / 13);
    const lines = (s: number) => {
      ctx.font = `${s}px ${family}`;
      const rows: string[] = [];
      for (const word of cue.text.split(/\s+/).filter(Boolean)) {
        const next = rows.length ? `${rows[rows.length - 1]} ${word}` : word;
        if (rows.length && ctx.measureText(next).width <= maxWidth) rows[rows.length - 1] = next;
        else rows.push(word);
      }
      return rows;
    };
    let rows = lines(size);
    // Shrink until it fits in three rows and every row fits the width.
    while ((rows.length > 3 || rows.some((r) => ctx.measureText(r).width > maxWidth)) && size > 24) rows = lines((size -= 4));
    ctx.textAlign = "center";
    ctx.direction = rtl ? "rtl" : "ltr";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    const lineH = size * 1.2;
    const top = boxH / 2 - ((rows.length - 1) * lineH) / 2;
    rows.forEach((row, r) => {
      const y = top + r * lineH;
      ctx.lineWidth = Math.max(6, Math.round(size / 5));
      ctx.strokeStyle = "#2A1235";
      ctx.strokeText(row, w / 2, y);
      ctx.fillStyle = r % 2 ? "#FFFFFF" : "#FFC83D";
      ctx.fillText(row, w / 2, y);
    });
    const file = path.join(outDir, `lyric-${String(i).padStart(3, "0")}.png`);
    await writeFile(file, canvas.toBuffer("image/png"));
    out.push({ ...cue, file, y: Math.round(h * 0.42 - boxH / 2) });
  }
  return out;
}
