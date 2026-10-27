import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import type { Resolution } from "@/lib/providers/types";
import { FRAME_SIZE } from "./assemble";

export interface Cue {
  start: number;
  end: number;
  text: string;
}

const MAX_WORDS = 3;
const MAX_CHARS = 22;
const DEVANAGARI = /[ऀ-ॿ]/;

// Short phrases read better on vertical video than full sentences.
export function chunkWords(text: string): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = [...current, word].join(" ");
    if (current.length > 0 && (current.length >= MAX_WORDS || next.length > MAX_CHARS)) {
      chunks.push(current.join(" "));
      current = [word];
    } else {
      current.push(word);
    }
  }
  if (current.length) chunks.push(current.join(" "));
  return chunks;
}

// TTS gives no word timings, so each phrase gets a share of its shot's
// narration time proportional to its length. Shots are ~5s, which keeps
// the drift small enough to read naturally in any language.
export function buildCues(narration: string[], audioSec: number[], clipSeconds: number): Cue[] {
  const cues: Cue[] = [];
  narration.forEach((text, i) => {
    const chunks = chunkWords(text);
    if (!chunks.length) return;
    const shotStart = i * clipSeconds;
    const spoken = Math.min(audioSec[i] || clipSeconds, clipSeconds);
    const weights = chunks.map((c) => c.length + 1);
    const total = weights.reduce((a, b) => a + b, 0);
    let t = shotStart;
    chunks.forEach((chunk, j) => {
      const end = j === chunks.length - 1 ? shotStart + spoken : t + (spoken * weights[j]) / total;
      cues.push({ start: round(t), end: round(end), text: chunk });
      t = end;
    });
  });
  return cues;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// libass and FFmpeg's drawtext mis-shape Devanagari conjuncts (e.g. क्ष), so
// each phrase is drawn with Skia + HarfBuzz and overlaid as an image.
export interface CaptionImage extends Cue {
  file: string;
  y: number;
}

let fontsRegistered = "";

function registerFonts(fontsDir: string) {
  if (fontsRegistered === fontsDir) return;
  GlobalFonts.registerFromPath(path.join(fontsDir, "NotoSansDevanagari-Bold.ttf"), "Noto Sans Devanagari");
  GlobalFonts.registerFromPath(path.join(fontsDir, "NotoSans-Bold.ttf"), "Noto Sans");
  fontsRegistered = fontsDir;
}

export async function renderCaptionImages(
  cues: Cue[],
  resolution: Resolution,
  fontsDir: string,
  outDir: string,
): Promise<CaptionImage[]> {
  registerFonts(fontsDir);
  const { w, h } = FRAME_SIZE[resolution];
  const boxH = Math.round(h / 9);
  const maxWidth = w * 0.86;
  const images: CaptionImage[] = [];
  for (const [i, cue] of cues.entries()) {
    const canvas = createCanvas(w, boxH);
    const ctx = canvas.getContext("2d");
    const family = DEVANAGARI.test(cue.text) ? "'Noto Sans Devanagari', 'Noto Sans'" : "'Noto Sans', 'Noto Sans Devanagari'";
    let size = Math.round(h / 20);
    ctx.font = `${size}px ${family}`;
    // Shrink long single words instead of letting them run off-screen.
    while (ctx.measureText(cue.text).width > maxWidth && size > 16) {
      size -= 2;
      ctx.font = `${size}px ${family}`;
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(4, Math.round(size / 7));
    ctx.strokeStyle = "rgba(0,0,0,0.9)";
    ctx.strokeText(cue.text, w / 2, boxH / 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(cue.text, w / 2, boxH / 2);
    const file = path.join(outDir, `caption-${String(i).padStart(3, "0")}.png`);
    await writeFile(file, canvas.toBuffer("image/png"));
    // Sits in the lower third, above the AI label.
    images.push({ ...cue, file, y: Math.round(h * 0.72) });
  }
  return images;
}
