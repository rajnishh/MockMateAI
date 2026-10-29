import { spawn } from "node:child_process";
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { captionFont, chunkWords, registerFonts } from "@/lib/pipeline/captions";
import {
  type Brand,
  brandPalette,
  clamp01,
  contrastRatio,
  drawLine,
  easeOutBack,
  easeOutCubic,
  enter,
  fit,
  font,
  formatStat,
  norm,
  type Palette,
  THEMES,
} from "@/lib/motion/render";
import type { TimedWord } from "@/lib/providers/whisper";
import type { Card, EditPlan } from "./plan";

export const EDIT_SIZE = { w: 1080, h: 1920 };
export const EDIT_FPS = 30;
const ZOOM = 1.14;
// Faces in selfie videos sit in the upper half, so punch-ins aim a little above centre.
const FOCUS_Y = 0.42;

export interface EditRenderInput {
  source: string;
  output: string;
  durationSec: number;
  plan: EditPlan;
  words: TimedWord[];
  captions: boolean;
  brand?: Brand;
  watermark: boolean;
  language?: string;
  fontsDir: string;
}

// How far zoomed in the frame is at time t: eases in over 0.2 s, holds, eases out over 0.25 s.
export function zoomAt(zooms: EditPlan["zooms"], t: number): number {
  for (const z of zooms) {
    if (t < z.start || t > z.end + 0.25) continue;
    const inP = easeOutCubic((t - z.start) / 0.2);
    const outP = t > z.end ? 1 - easeOutCubic((t - z.end) / 0.25) : 1;
    return 1 + (ZOOM - 1) * Math.min(inP, outP);
  }
  return 1;
}

// The caption phrase on screen at time t, and which of its words is being spoken.
export function captionAt(words: TimedWord[], t: number): { phrase: string[]; active: number } | null {
  if (!words.length) return null;
  // Phrases of up to 3 words that never span a pause longer than 0.6 s.
  const phrases: TimedWord[][] = [];
  for (const w of words) {
    const last = phrases[phrases.length - 1];
    if (last && last.length < 3 && w.start - last[last.length - 1].end < 0.6 && chunkWords([...last, w].map((x) => x.word).join(" ")).length === 1) last.push(w);
    else phrases.push([w]);
  }
  for (let i = 0; i < phrases.length; i++) {
    const p = phrases[i];
    const next = phrases[i + 1];
    const until = Math.min(p[p.length - 1].end + 0.4, next ? next[0].start : Infinity);
    if (t >= p[0].start && t < until) {
      let active = p.findIndex((w) => t < w.end);
      if (active < 0) active = p.length - 1;
      return { phrase: p.map((w) => w.word), active };
    }
  }
  return null;
}

function drawCaption(ctx: SKRSContext2D, w: number, h: number, p: Palette, cap: { phrase: string[]; active: number }) {
  const text = cap.phrase.join(" ");
  const size = Math.round(w * 0.058);
  const rtl = font(ctx, text, size);
  ctx.textBaseline = "middle";
  const y = h * 0.8;
  const tw = Math.min(ctx.measureText(text).width, w * 0.86);
  ctx.fillStyle = "rgba(10,10,14,0.72)";
  ctx.beginPath();
  ctx.roundRect(w / 2 - tw / 2 - size * 0.6, y - size * 0.95, tw + size * 1.2, size * 1.9, size * 0.5);
  ctx.fill();
  const active = contrastRatio(p.accent, "#0a0a0e") >= 4.5 ? p.accent : "#ffd166";
  if (rtl) {
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, w / 2, y, w * 0.86);
    return;
  }
  const space = ctx.measureText(" ").width;
  const widths = cap.phrase.map((x) => ctx.measureText(x).width);
  let x = w / 2 - (widths.reduce((a, b) => a + b, 0) + space * (cap.phrase.length - 1)) / 2;
  ctx.textAlign = "left";
  cap.phrase.forEach((wd, i) => {
    ctx.fillStyle = i === cap.active ? active : "#ffffff";
    ctx.fillText(wd, x, y);
    x += widths[i] + space;
  });
}

// Cards sit in the lower middle (below a typical selfie face, above the captions) on a frosted panel.
function drawCard(ctx: SKRSContext2D, w: number, h: number, p: Palette, card: Card, t: number, language: string) {
  const local = t - card.start;
  const out = clamp01((card.end - t) / 0.25);
  const pop = easeOutBack(enter(local, 0, 0.4));
  if (pop <= 0 || out <= 0) return;
  const cx = w / 2;
  const cy = h * 0.6;
  const panelW = w * 0.86;
  ctx.save();
  ctx.globalAlpha = out * clamp01(pop * 1.4);
  ctx.translate(cx, cy);
  ctx.scale(0.9 + 0.1 * pop, 0.9 + 0.1 * pop);
  ctx.translate(-cx, -cy);
  const panel = (height: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(cx - panelW / 2, cy - height / 2, panelW, height, w * 0.045);
    ctx.fill();
  };
  ctx.textBaseline = "middle";
  if (card.type === "point") {
    const { size, lines } = fit(ctx, card.text, panelW * 0.86, Math.round(w * 0.078), 3);
    const lh = size * 1.3;
    panel(lines.length * lh + size * 1.2, "rgba(255,255,255,0.92)");
    const rtl = font(ctx, card.text, size);
    const marks = new Set((card.highlight ?? "").split(/\s+/).map(norm).filter(Boolean));
    const accentOnWhite = contrastRatio(p.accent, "#ffffff") >= 3 ? p.accent : "#b4235a";
    lines.forEach((l, i) => drawLine(ctx, l, cx, cy - (lines.length * lh) / 2 + lh * (i + 0.5), "#111111", accentOnWhite, marks, rtl));
  } else if (card.type === "list") {
    const size = Math.round(w * 0.052);
    const rowH = size * 1.7;
    const height = rowH * (card.items.length + 1) + size;
    panel(height, "rgba(255,255,255,0.92)");
    const top = cy - height / 2 + size * 0.5;
    font(ctx, card.heading, Math.round(size * 1.15));
    ctx.fillStyle = "#111111";
    ctx.textAlign = "center";
    ctx.fillText(card.heading, cx, top + rowH / 2, panelW * 0.9);
    card.items.forEach((item, i) => {
      // Items tick in one by one, spread over the card's time.
      const appear = enter(local, 0.3 + (i * (card.end - card.start - 0.6)) / card.items.length, 0.3);
      if (appear <= 0) return;
      const y = top + rowH * (i + 1.5);
      ctx.globalAlpha = out * appear;
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(cx - panelW / 2 + size * 1.4, y, size * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = p.onAccent;
      ctx.lineWidth = Math.max(3, size / 8);
      ctx.beginPath();
      ctx.moveTo(cx - panelW / 2 + size * 1.15, y);
      ctx.lineTo(cx - panelW / 2 + size * 1.35, y + size * 0.2);
      ctx.lineTo(cx - panelW / 2 + size * 1.7, y - size * 0.2);
      ctx.stroke();
      font(ctx, item, size);
      ctx.fillStyle = "#111111";
      ctx.textAlign = "left";
      ctx.fillText(item, cx - panelW / 2 + size * 2.4, y, panelW - size * 3);
    });
  } else if (card.type === "stat") {
    const count = easeOutCubic(enter(local, 0.1, 1));
    const size = Math.round(w * 0.12);
    panel(size * 2.6, p.accent);
    const value = `${card.prefix ?? ""}${formatStat(card.value, count, language)}${card.suffix ?? ""}`;
    font(ctx, value, size);
    ctx.fillStyle = p.onAccent;
    ctx.textAlign = "center";
    ctx.fillText(value, cx, cy - size * 0.35, panelW * 0.9);
    font(ctx, card.label, Math.round(size * 0.38));
    ctx.fillText(card.label, cx, cy + size * 0.65, panelW * 0.9);
  } else {
    const size = Math.round(w * 0.065);
    const hasAction = Boolean(card.action);
    panel(size * (hasAction ? 4.2 : 2.2), "rgba(255,255,255,0.92)");
    font(ctx, card.text, size);
    ctx.fillStyle = "#111111";
    ctx.textAlign = "center";
    ctx.fillText(card.text, cx, cy - (hasAction ? size * 0.8 : 0), panelW * 0.9);
    if (card.action) {
      const pulse = 1 + 0.04 * Math.sin(Math.max(0, local - 0.6) * 5);
      font(ctx, card.action, Math.round(size * 0.8));
      const bw = (ctx.measureText(card.action).width + size * 1.6) * pulse;
      const bh = size * 1.6 * pulse;
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.roundRect(cx - bw / 2, cy + size * 0.95 - bh / 2, bw, bh, bh / 2);
      ctx.fill();
      ctx.fillStyle = p.onAccent;
      ctx.fillText(card.action, cx, cy + size * 0.95, panelW * 0.8);
    }
  }
  ctx.restore();
}

function drawWatermark(ctx: SKRSContext2D, w: number, h: number, handle?: string, watermark?: boolean) {
  const small = Math.round(h / 55);
  ctx.direction = "ltr";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = [handle, watermark ? "Edited with Reelkar" : ""].filter(Boolean).join(" · ");
  if (!label) return;
  ctx.font = `${small}px 'Noto Sans'`;
  const lw = ctx.measureText(label).width + 24;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.roundRect(w / 2 - lw / 2, h * 0.9 - small, lw, small * 2, 8);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText(label, w / 2, h * 0.9);
}

// Decoder: any phone video → 1080x1920 RGBA frames at 30 fps, cropped to fill 9:16.
export function decodeArgs(source: string, w: number, h: number): string[] {
  return ["-v", "error", "-i", source, "-vf", `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=${EDIT_FPS},format=rgba`, "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"];
}

// Encoder: edited frames from stdin, the creator's original audio from the source file.
export function encodeArgs(source: string, output: string, w: number, h: number): string[] {
  return [
    "-y", "-v", "error",
    "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${w}x${h}`, "-r", String(EDIT_FPS), "-i", "pipe:0",
    "-i", source,
    "-map", "0:v", "-map", "1:a?",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k",
    "-shortest", "-movflags", "+faststart",
    output,
  ];
}

export async function renderEdit(input: EditRenderInput): Promise<void> {
  registerFonts(input.fontsDir);
  const { w, h } = EDIT_SIZE;
  const p = brandPalette(input.brand ?? {}, THEMES.navy);
  const frameBytes = w * h * 4;
  const src = createCanvas(w, h);
  const srcCtx = src.getContext("2d");
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  const imageData = srcCtx.createImageData(w, h);

  const enc = spawn("ffmpeg", encodeArgs(input.source, input.output, w, h), { stdio: ["pipe", "ignore", "pipe"] });
  const dec = spawn("ffmpeg", decodeArgs(input.source, w, h), { stdio: ["ignore", "pipe", "pipe"] });
  let errors = "";
  for (const proc of [enc, dec]) proc.stderr!.on("data", (d) => (errors = (errors + d).slice(-4000)));
  const encDone = new Promise<void>((resolve, reject) => {
    enc.on("error", reject);
    enc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg encode exited ${code}: ${errors}`))));
  });
  const decDone = new Promise<void>((resolve, reject) => {
    dec.on("error", reject);
    dec.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg decode exited ${code}: ${errors}`))));
  });

  const frame = Buffer.alloc(frameBytes);
  let filled = 0;
  let index = 0;
  const emit = async () => {
    const t = index++ / EDIT_FPS;
    imageData.data.set(frame);
    srcCtx.putImageData(imageData, 0, 0);
    const z = zoomAt(input.plan.zooms, t);
    const sw = w / z;
    const sh = h / z;
    ctx.drawImage(src, (w - sw) / 2, Math.max(0, Math.min(h - sh, h * FOCUS_Y - sh * FOCUS_Y)), sw, sh, 0, 0, w, h);
    for (const card of input.plan.cards) if (t >= card.start && t <= card.end) drawCard(ctx, w, h, p, card, t, input.language ?? "en");
    if (input.captions) {
      const cap = captionAt(input.words, t);
      if (cap) drawCaption(ctx, w, h, p, cap);
    }
    drawWatermark(ctx, w, h, input.brand?.handle, input.watermark);
    const pixels = ctx.getImageData(0, 0, w, h).data;
    if (!enc.stdin!.write(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength))) {
      await new Promise<void>((r) => enc.stdin!.once("drain", () => r()));
    }
  };

  // Frames arrive as a byte stream; cut it into whole frames.
  for await (const chunk of dec.stdout! as AsyncIterable<Buffer>) {
    let offset = 0;
    while (offset < chunk.length) {
      const n = Math.min(frameBytes - filled, chunk.length - offset);
      chunk.copy(frame, filled, offset, offset + n);
      filled += n;
      offset += n;
      if (filled === frameBytes) {
        await emit();
        filled = 0;
      }
    }
  }
  await decDone;
  enc.stdin!.end();
  await encDone;
}
