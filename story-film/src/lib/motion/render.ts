import { spawn } from "node:child_process";
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { AI_LABEL } from "@/lib/pipeline/assemble";
import { captionFont, registerFonts } from "@/lib/pipeline/captions";
import type { MotionScript, MotionTheme, Slide } from "./script";

export const MOTION_FPS = 30;

interface Palette {
  bg: [string, string];
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  highlight: string;
  blob: string;
}

// Four looks the script writer can choose from. Text colours keep at least 4.5:1 contrast on the background.
export const THEMES: Record<MotionTheme, Palette> = {
  navy: { bg: ["#18264a", "#0d1529"], text: "#ffffff", muted: "#c9d2e6", accent: "#2bc4b4", onAccent: "#062a26", highlight: "#f27a5e", blob: "rgba(43,196,180,0.16)" },
  saffron: { bg: ["#fff4e0", "#ffe2b8"], text: "#2a1a05", muted: "#6b4a1c", accent: "#c2410c", onAccent: "#ffffff", highlight: "#b4235a", blob: "rgba(232,115,12,0.14)" },
  mint: { bg: ["#e9f8f3", "#cdeee3"], text: "#0f2e28", muted: "#3d5f57", accent: "#0a756b", onAccent: "#ffffff", highlight: "#b4442b", blob: "rgba(10,117,107,0.12)" },
  night: { bg: ["#0b0b12", "#1c1c2b"], text: "#f5f5f7", muted: "#b9b9c8", accent: "#ffd166", onAccent: "#1a1300", highlight: "#ef476f", blob: "rgba(255,209,102,0.12)" },
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeOutCubic = (x: number) => 1 - (1 - clamp01(x)) ** 3;
const easeOutBack = (x: number) => {
  const c = 1.7;
  const p = clamp01(x) - 1;
  return 1 + (c + 1) * p ** 3 + c * p ** 2;
};
// Progress of an element that starts `delay` seconds into the slide and animates for `dur` seconds.
const enter = (t: number, delay: number, dur = 0.45) => clamp01((t - delay) / dur);

interface Frame {
  ctx: SKRSContext2D;
  w: number;
  h: number;
  p: Palette;
  // Seconds since the slide started, the slide's length, and seconds since the reel started.
  t: number;
  d: number;
  global: number;
}

function font(ctx: SKRSContext2D, text: string, size: number): boolean {
  const { family, rtl } = captionFont(text);
  ctx.font = `${size}px ${family}`;
  ctx.direction = rtl ? "rtl" : "ltr";
  return rtl;
}

// Word wrap that never splits inside a word, so Indic conjuncts and Arabic joins stay intact.
function wrap(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// Largest size (down to min) at which the text fits in maxLines.
function fit(ctx: SKRSContext2D, text: string, maxWidth: number, start: number, maxLines: number, min = 28): { size: number; lines: string[] } {
  for (let size = start; size >= min; size -= 4) {
    font(ctx, text, size);
    const lines = wrap(ctx, text, maxWidth);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxWidth)) return { size, lines };
  }
  font(ctx, text, min);
  return { size: min, lines: wrap(ctx, text, maxWidth) };
}

function background(f: Frame) {
  const { ctx, w, h, p, global } = f;
  const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
  g.addColorStop(0, p.bg[0]);
  g.addColorStop(1, p.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Three soft circles drifting slowly keep the frame alive between text moves.
  ctx.fillStyle = p.blob;
  for (const [i, r] of [0.5, 0.35, 0.28].entries()) {
    const x = w * (0.2 + 0.6 * ((i * 0.37 + 0.5 + 0.08 * Math.sin(global * 0.4 + i * 2)) % 1));
    const y = h * (0.15 + 0.7 * ((i * 0.29 + 0.1 + 0.05 * Math.cos(global * 0.3 + i)) % 1));
    ctx.beginPath();
    ctx.arc(x, y, w * r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function textBlock(f: Frame, text: string, opts: { y: number; size: number; maxLines: number; color: string; alpha: number; dy?: number; scale?: number; width?: number }) {
  const { ctx, w } = f;
  const maxWidth = opts.width ?? w * 0.84;
  const { size, lines } = fit(ctx, text, maxWidth, opts.size, opts.maxLines);
  const lh = size * 1.32;
  const top = opts.y - (lines.length * lh) / 2 + (opts.dy ?? 0);
  ctx.save();
  ctx.globalAlpha = opts.alpha;
  ctx.fillStyle = opts.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (opts.scale && opts.scale !== 1) {
    ctx.translate(w / 2, opts.y);
    ctx.scale(opts.scale, opts.scale);
    ctx.translate(-w / 2, -opts.y);
  }
  lines.forEach((l, i) => ctx.fillText(l, w / 2, top + lh * (i + 0.5)));
  ctx.restore();
  return { bottom: top + lines.length * lh, size };
}

function pill(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
}

function drawTitle(f: Frame, s: Extract<Slide, { type: "title" }>) {
  const { ctx, w, h, p, t } = f;
  const pop = easeOutBack(enter(t, 0.05, 0.55));
  const head = textBlock(f, s.headline, { y: h * 0.42, size: Math.round(w * 0.12), maxLines: 4, color: p.text, alpha: clamp01(pop * 1.4), scale: 0.85 + 0.15 * pop });
  const bar = easeOutCubic(enter(t, 0.35, 0.5));
  ctx.fillStyle = p.accent;
  ctx.fillRect(w / 2 - (w * 0.22 * bar) / 2, head.bottom + h * 0.02, w * 0.22 * bar, Math.max(6, h * 0.007));
  if (s.sub) {
    const a = easeOutCubic(enter(t, 0.55));
    textBlock(f, s.sub, { y: head.bottom + h * 0.08, size: Math.round(w * 0.055), maxLines: 3, color: p.muted, alpha: a, dy: (1 - a) * 30 });
  }
}

function drawList(f: Frame, s: Extract<Slide, { type: "list" }>) {
  const { ctx, w, h, p, t } = f;
  const a = easeOutCubic(enter(t, 0.05));
  // Heading plus rows form one block centred a little above the middle (the bottom is covered by app buttons).
  const rowH = Math.min(h * 0.115, (h * 0.55) / s.items.length);
  const blockH = h * 0.12 + rowH * s.items.length;
  const head = textBlock(f, s.heading, { y: h * 0.46 - blockH / 2 + h * 0.04, size: Math.round(w * 0.09), maxLines: 2, color: p.text, alpha: a, dy: (1 - a) * 30 });
  const top = head.bottom + h * 0.04;
  const badge = Math.min(rowH * 0.6, w * 0.1);
  s.items.forEach((item, i) => {
    const e = enter(t, 0.6 + i * 0.7, 0.45);
    if (e <= 0) return;
    const pe = easeOutCubic(e);
    const cy = top + rowH * (i + 0.5);
    const rtl = captionFont(item).rtl;
    const badgeX = rtl ? w * 0.92 - badge : w * 0.08;
    ctx.save();
    ctx.globalAlpha = pe;
    ctx.translate((rtl ? 1 : -1) * (1 - pe) * w * 0.08, 0);
    // Numbered badge
    const bs = easeOutBack(e);
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(badgeX + badge / 2, cy, (badge / 2) * bs, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.onAccent;
    font(ctx, "1", Math.round(badge * 0.55));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), badgeX + badge / 2, cy);
    // Item text
    const textW = w * 0.84 - badge - w * 0.04;
    const { size, lines } = fit(ctx, item, textW, Math.round(w * 0.072), 2, 26);
    font(ctx, item, size);
    ctx.fillStyle = p.text;
    ctx.textAlign = rtl ? "right" : "left";
    const x = rtl ? badgeX - w * 0.04 : badgeX + badge + w * 0.04;
    const lh = size * 1.25;
    lines.forEach((l, j) => ctx.fillText(l, x, cy + (j - (lines.length - 1) / 2) * lh));
    ctx.restore();
  });
}

export function formatStat(value: number, progress: number, language: string): string {
  const v = value * progress;
  const decimals = Number.isInteger(value) ? 0 : Math.min(2, (String(value).split(".")[1] ?? "").length);
  // Indian digit grouping (1,00,000) for Indian languages.
  const locale = ["hi", "mr", "bn", "ta", "te"].includes(language) ? "en-IN" : "en-US";
  return new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(progress >= 1 ? value : Number(v.toFixed(decimals)));
}

function drawStat(f: Frame, s: Extract<Slide, { type: "stat" }>, language: string) {
  const { ctx, w, h, p, t } = f;
  const count = easeOutCubic(enter(t, 0.15, 1.3));
  const cx = w / 2;
  const cy = h * 0.4;
  const r = w * 0.32;
  // Ring that fills while the number counts up.
  ctx.lineWidth = w * 0.035;
  ctx.lineCap = "round";
  ctx.strokeStyle = p.blob;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = p.accent;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * count);
  ctx.stroke();
  const label = `${s.prefix ?? ""}${formatStat(s.value, count, language)}${s.suffix ?? ""}`;
  textBlock(f, label, { y: cy, size: Math.round(w * 0.16), maxLines: 1, color: p.text, alpha: clamp01(enter(t, 0.05, 0.3)), width: r * 1.7 });
  const a = easeOutCubic(enter(t, 0.9));
  textBlock(f, s.label, { y: cy + r + h * 0.1, size: Math.round(w * 0.06), maxLines: 3, color: p.muted, alpha: a, dy: (1 - a) * 30 });
}

function drawQuote(f: Frame, s: Extract<Slide, { type: "quote" }>) {
  const { ctx, w, h, p, t } = f;
  const m = easeOutBack(enter(t, 0, 0.5));
  ctx.save();
  ctx.globalAlpha = clamp01(m);
  ctx.fillStyle = p.highlight;
  font(ctx, "“", Math.round(w * 0.35 * m));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("“", w / 2, h * 0.24);
  ctx.restore();
  // Words appear one by one (never letters, which would break Indic and Arabic shaping).
  const words = s.text.split(/\s+/).filter(Boolean);
  const shown = Math.min(words.length, Math.floor(clamp01((t - 0.4) / Math.max(1, f.d * 0.55)) * words.length) + (t > 0.4 ? 1 : 0));
  const visible = words.slice(0, shown).join(" ");
  // Lay out the full quote so lines don't jump as words appear.
  const { size, lines } = fit(ctx, s.text, w * 0.82, Math.round(w * 0.075), 6);
  const lh = size * 1.35;
  const top = h * 0.48 - (lines.length * lh) / 2;
  const rtl = font(ctx, s.text, size);
  ctx.fillStyle = p.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let used = 0;
  lines.forEach((l, i) => {
    const lw = l.split(/\s+/).length;
    const part = visible.split(/\s+/).slice(used, used + lw).join(" ");
    used += lw;
    if (!part) return;
    // A partly revealed line starts where the full line will start (right edge for right-to-left).
    const shift = part === l ? 0 : (ctx.measureText(l).width - ctx.measureText(part).width) / 2;
    ctx.fillText(part, w / 2 + (rtl ? shift : -shift), top + lh * (i + 0.5));
  });
  if (s.author) {
    const a = easeOutCubic(enter(t, Math.min(f.d - 0.8, 0.6 + f.d * 0.55)));
    textBlock(f, `— ${s.author}`, { y: top + lines.length * lh + h * 0.06, size: Math.round(w * 0.05), maxLines: 1, color: p.muted, alpha: a });
  }
}

function drawCta(f: Frame, s: Extract<Slide, { type: "cta" }>) {
  const { ctx, w, h, p, t } = f;
  const pop = easeOutBack(enter(t, 0.05, 0.55));
  const head = textBlock(f, s.text, { y: h * 0.4, size: Math.round(w * 0.1), maxLines: 4, color: p.text, alpha: clamp01(pop * 1.4), scale: 0.85 + 0.15 * pop });
  if (s.action) {
    const a = easeOutBack(enter(t, 0.5, 0.5));
    const pulse = 1 + 0.035 * Math.sin(Math.max(0, t - 1) * 5);
    const size = Math.round(w * 0.058);
    font(ctx, s.action, size);
    const tw = Math.min(ctx.measureText(s.action).width, w * 0.7);
    const bw = (tw + size * 2) * pulse * a;
    const bh = size * 2.1 * pulse * a;
    const y = head.bottom + h * 0.08;
    if (bw > 0 && bh > 0) {
      pill(ctx, w / 2 - bw / 2, y - bh / 2, bw, bh, p.accent);
      ctx.save();
      ctx.globalAlpha = clamp01(a);
      ctx.fillStyle = p.onAccent;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(s.action, w / 2, y, w * 0.7);
      ctx.restore();
    }
  }
}

function chrome(f: Frame, total: number, watermark: boolean) {
  const { ctx, w, h, p, global } = f;
  // Thin progress bar at the top: viewers see how much is left, which helps them stay.
  ctx.fillStyle = p.blob;
  ctx.fillRect(0, 0, w, Math.max(5, h * 0.005));
  ctx.fillStyle = p.accent;
  ctx.fillRect(0, 0, w * clamp01(global / total), Math.max(5, h * 0.005));
  // The AI label is always shown (platform disclosure); the free plan adds a note.
  const label = watermark ? `${AI_LABEL} · free plan` : AI_LABEL;
  ctx.font = `${Math.round(h / 52)}px 'Noto Sans'`;
  ctx.direction = "ltr";
  const lw = ctx.measureText(label).width + 24;
  const lh = Math.round(h / 52) * 1.8;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.roundRect(w / 2 - lw / 2, h - h / 20 - lh, lw, lh, 8);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, w / 2, h - h / 20 - lh / 2);
}

export function drawFrame(f: Omit<Frame, "t" | "d"> & { slide: Slide; t: number; d: number; total: number; watermark: boolean; language: string }) {
  background(f);
  // Each slide fades out over its last quarter second for a soft cut.
  const out = clamp01((f.d - f.t) / 0.25);
  f.ctx.save();
  f.ctx.globalAlpha = out;
  const s = f.slide;
  if (s.type === "title") drawTitle(f, s);
  else if (s.type === "list") drawList(f, s);
  else if (s.type === "stat") drawStat(f, s, f.language);
  else if (s.type === "quote") drawQuote(f, s);
  else drawCta(f, s);
  f.ctx.restore();
  chrome(f, f.total, f.watermark);
}

export interface RenderInput {
  script: MotionScript;
  durations: number[];
  narration: string[];
  music?: string;
  width: number;
  height: number;
  watermark: boolean;
  fontsDir: string;
  output: string;
}

// FFmpeg arguments: raw RGBA frames on stdin, each narration delayed to its slide's start, music underneath.
export function motionFfmpegArgs(input: Omit<RenderInput, "script" | "fontsDir">): string[] {
  const { durations, narration, music, width, height, output } = input;
  const total = durations.reduce((a, b) => a + b, 0);
  const starts = durations.map((_, i) => durations.slice(0, i).reduce((a, b) => a + b, 0));
  const args = ["-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${width}x${height}`, "-r", String(MOTION_FPS), "-i", "pipe:0"];
  for (const n of narration) args.push("-i", n);
  if (music) args.push("-stream_loop", "-1", "-i", music);
  const filters = narration.map((_, i) => {
    const ms = Math.round(starts[i] * 1000 + 250);
    return `[${i + 1}:a]aresample=48000,adelay=${ms}|${ms}[n${i}]`;
  });
  const voices = narration.map((_, i) => `[n${i}]`).join("");
  if (music) {
    filters.push(`[${narration.length + 1}:a]aresample=48000,volume=0.14[m]`);
    filters.push(`${voices}[m]amix=inputs=${narration.length + 1}:duration=longest:normalize=0[aout]`);
  } else {
    filters.push(`${voices}amix=inputs=${narration.length}:duration=longest:normalize=0[aout]`);
  }
  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "0:v", "-map", "[aout]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k",
    "-t", total.toFixed(2),
    "-movflags", "+faststart",
    "-metadata", `comment=${AI_LABEL}`,
    output,
  );
  return args;
}

// Draws every frame and streams it to FFmpeg, respecting backpressure so memory stays flat.
export async function renderMotionVideo(input: RenderInput): Promise<void> {
  registerFonts(input.fontsDir);
  const { width: w, height: h, durations, script } = input;
  const total = durations.reduce((a, b) => a + b, 0);
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  const p = THEMES[script.theme];

  const ff = spawn("ffmpeg", motionFfmpegArgs(input), { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  ff.stderr.on("data", (d) => (stderr = (stderr + d).slice(-4000)));
  const done = new Promise<void>((resolve, reject) => {
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr}`))));
  });

  const frames = Math.round(total * MOTION_FPS);
  let slide = 0;
  let slideStart = 0;
  for (let i = 0; i < frames; i++) {
    const global = i / MOTION_FPS;
    while (slide < durations.length - 1 && global >= slideStart + durations[slide]) slideStart += durations[slide++];
    drawFrame({ ctx, w, h, p, global, slide: script.slides[slide], t: global - slideStart, d: durations[slide], total, watermark: input.watermark, language: script.language });
    const pixels = ctx.getImageData(0, 0, w, h).data;
    if (!ff.stdin.write(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength))) {
      await new Promise<void>((r) => ff.stdin.once("drain", () => r()));
    }
  }
  ff.stdin.end();
  await done;
}
