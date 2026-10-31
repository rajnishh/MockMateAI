import { spawn } from "node:child_process";
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { AI_LABEL } from "@/lib/pipeline/assemble";
import { captionFont, chunkWords, registerFonts } from "@/lib/pipeline/captions";
import type { MotionScript, MotionTheme, Slide } from "./script";

export const MOTION_FPS = 30;
// Motion reels render at full 1080x1920: drawing text is cheap, unlike AI video.
export const MOTION_SIZE = { w: 1080, h: 1920 };

export interface Palette {
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

export interface Brand {
  // Creator's brand colour, e.g. "#e0198a".
  accent?: string;
  background?: "light" | "dark";
  handle?: string;
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = hexRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

// A palette from the creator's brand colour. Text stays near black or white for readability;
// the brand colour fills buttons and highlights, and is darkened or lightened until it reads on the background.
export function brandPalette(brand: Brand, fallback: Palette): Palette {
  if (!brand.accent || !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(brand.accent)) return fallback;
  const dark = brand.background === "dark";
  const bg: [string, string] = dark ? ["#121318", "#08090c"] : ["#fbfaf7", "#f1efe9"];
  const [r, g, b] = hexRgb(brand.accent);
  const onFor = (c: string) => (contrastRatio("#ffffff", c) >= contrastRatio("#111111", c) ? "#ffffff" : "#111111");
  // Darken (light background) or lighten (dark background) until the colour reads on the
  // background and its button text reads on it; both improve in the same direction.
  let accent = brand.accent;
  for (let k = 1; k <= 12 && (contrastRatio(accent, bg[0]) < 3 || contrastRatio(onFor(accent), accent) < 4.5); k++) {
    const c = (v: number) => Math.max(0, Math.min(255, Math.round(dark ? v + (255 - v) * 0.08 * k : v * (1 - 0.07 * k))));
    accent = `#${[c(r), c(g), c(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }
  return {
    bg,
    text: dark ? "#f6f6f8" : "#16161a",
    muted: dark ? "#b8b8c4" : "#55555f",
    accent,
    onAccent: onFor(accent),
    highlight: accent,
    blob: `rgba(${hexRgb(accent).join(",")},${dark ? 0.14 : 0.07})`,
  };
}

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const easeOutCubic = (x: number) => 1 - (1 - clamp01(x)) ** 3;
export const easeOutBack = (x: number) => {
  const c = 1.7;
  const p = clamp01(x) - 1;
  return 1 + (c + 1) * p ** 3 + c * p ** 2;
};
// Progress of an element that starts `delay` seconds into the slide and animates for `dur` seconds.
export const enter = (t: number, delay: number, dur = 0.45) => clamp01((t - delay) / dur);

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

export function font(ctx: SKRSContext2D, text: string, size: number): boolean {
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
export function fit(ctx: SKRSContext2D, text: string, maxWidth: number, start: number, maxLines: number, min = 28): { size: number; lines: string[] } {
  for (let size = start; size >= min; size -= 4) {
    font(ctx, text, size);
    const lines = wrap(ctx, text, maxWidth);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxWidth)) return { size, lines };
  }
  font(ctx, text, min);
  return { size: min, lines: wrap(ctx, text, maxWidth) };
}

export const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");

// Draws one centred line, colouring the words that belong to the highlight phrase.
export function drawLine(ctx: SKRSContext2D, line: string, cx: number, y: number, color: string, accent: string, highlight: Set<string>, rtl: boolean) {
  if (!highlight.size || rtl) {
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.fillText(line, cx, y);
    return;
  }
  const words = line.split(" ");
  const space = ctx.measureText(" ").width;
  const widths = words.map((wd) => ctx.measureText(wd).width);
  let x = cx - (widths.reduce((a, b) => a + b, 0) + space * (words.length - 1)) / 2;
  ctx.textAlign = "left";
  words.forEach((wd, i) => {
    ctx.fillStyle = highlight.has(norm(wd)) ? accent : color;
    ctx.fillText(wd, x, y);
    x += widths[i] + space;
  });
}

function textBlock(
  f: Frame,
  text: string,
  opts: { y: number; size: number; maxLines: number; color: string; alpha: number; dy?: number; scale?: number; width?: number; highlight?: string },
) {
  const { ctx, w, p } = f;
  const maxWidth = opts.width ?? w * 0.84;
  const { size, lines } = fit(ctx, text, maxWidth, opts.size, opts.maxLines);
  const rtl = font(ctx, text, size);
  const lh = size * 1.32;
  const top = opts.y - (lines.length * lh) / 2 + (opts.dy ?? 0);
  const marks = new Set((opts.highlight ?? "").split(/\s+/).map(norm).filter(Boolean));
  ctx.save();
  ctx.globalAlpha *= opts.alpha;
  ctx.textBaseline = "middle";
  if (opts.scale && opts.scale !== 1) {
    ctx.translate(w / 2, opts.y);
    ctx.scale(opts.scale, opts.scale);
    ctx.translate(-w / 2, -opts.y);
  }
  lines.forEach((l, i) => drawLine(ctx, l, w / 2, top + lh * (i + 0.5), opts.color, p.highlight, marks, rtl));
  ctx.restore();
  return { bottom: top + lines.length * lh, size };
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

function drawTitle(f: Frame, s: Extract<Slide, { type: "title" }>) {
  const { ctx, w, h, p, t } = f;
  const pop = easeOutBack(enter(t, 0.05, 0.55));
  const head = textBlock(f, s.headline, { y: h * 0.38, size: Math.round(w * 0.12), maxLines: 4, color: p.text, alpha: clamp01(pop * 1.4), scale: 0.85 + 0.15 * pop, highlight: s.highlight });
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
  // Heading plus rows form one block centred above the middle (the bottom is for captions and app buttons).
  const rowH = Math.min(h * 0.11, (h * 0.5) / s.items.length);
  const blockH = h * 0.12 + rowH * s.items.length;
  const head = textBlock(f, s.heading, { y: h * 0.42 - blockH / 2 + h * 0.04, size: Math.round(w * 0.09), maxLines: 2, color: p.text, alpha: a, dy: (1 - a) * 30 });
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
    ctx.globalAlpha *= pe;
    ctx.translate((rtl ? 1 : -1) * (1 - pe) * w * 0.08, 0);
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(badgeX + badge / 2, cy, (badge / 2) * easeOutBack(e), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.onAccent;
    font(ctx, "1", Math.round(badge * 0.55));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), badgeX + badge / 2, cy);
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

function ring(ctx: SKRSContext2D, cx: number, cy: number, r: number, width: number, track: string, color: string, progress: number) {
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.strokeStyle = track;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  if (progress <= 0) return;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
  ctx.stroke();
}

function drawStat(f: Frame, s: Extract<Slide, { type: "stat" }>, language: string) {
  const { w, h, p, t } = f;
  const count = easeOutCubic(enter(t, 0.15, 1.3));
  const cy = h * 0.38;
  const r = w * 0.32;
  ring(f.ctx, w / 2, cy, r, w * 0.035, p.blob, p.accent, count);
  const label = `${s.prefix ?? ""}${formatStat(s.value, count, language)}${s.suffix ?? ""}`;
  textBlock(f, label, { y: cy, size: Math.round(w * 0.16), maxLines: 1, color: p.text, alpha: clamp01(enter(t, 0.05, 0.3)), width: r * 1.7 });
  const a = easeOutCubic(enter(t, 0.9));
  textBlock(f, s.label, { y: cy + r + h * 0.08, size: Math.round(w * 0.06), maxLines: 3, color: p.muted, alpha: a, dy: (1 - a) * 30 });
}

function drawQuote(f: Frame, s: Extract<Slide, { type: "quote" }>) {
  const { ctx, w, h, p, t } = f;
  const m = easeOutBack(enter(t, 0, 0.5));
  if (m > 0) {
    ctx.save();
    ctx.globalAlpha *= clamp01(m);
    ctx.fillStyle = p.highlight;
    font(ctx, "“", Math.max(1, Math.round(w * 0.35 * m)));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("“", w / 2, h * 0.2);
    ctx.restore();
  }
  // Words appear one by one (never letters, which would break Indic and Arabic shaping).
  const words = s.text.split(/\s+/).filter(Boolean);
  const shown = Math.min(words.length, Math.floor(clamp01((t - 0.4) / Math.max(1, f.d * 0.55)) * words.length) + (t > 0.4 ? 1 : 0));
  const visible = words.slice(0, shown);
  // Lay out the full quote so lines don't jump as words appear.
  const { size, lines } = fit(ctx, s.text, w * 0.82, Math.round(w * 0.075), 6);
  const lh = size * 1.35;
  const top = h * 0.42 - (lines.length * lh) / 2;
  const rtl = font(ctx, s.text, size);
  ctx.fillStyle = p.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let used = 0;
  lines.forEach((l, i) => {
    const lw = l.split(/\s+/).length;
    const part = visible.slice(used, used + lw).join(" ");
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

function drawContrast(f: Frame, s: Extract<Slide, { type: "contrast" }>) {
  const { ctx, w, h, p, t } = f;
  const a = easeOutCubic(enter(t, 0.05));
  const before = textBlock(f, s.before, { y: h * 0.28, size: Math.round(w * 0.075), maxLines: 3, color: p.muted, alpha: a });
  // A line strikes through the old idea, then the better one pops in on a solid card.
  const strike = easeOutCubic(enter(t, 0.7, 0.5));
  if (strike > 0) {
    ctx.strokeStyle = p.highlight;
    ctx.lineWidth = Math.max(6, w * 0.012);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(w * 0.12, h * 0.28);
    ctx.lineTo(w * 0.12 + w * 0.76 * strike, h * 0.28);
    ctx.stroke();
  }
  const pop = easeOutBack(enter(t, 1.2, 0.5));
  if (pop <= 0) return;
  const { size, lines } = fit(ctx, s.after, w * 0.72, Math.round(w * 0.075), 3);
  const lh = size * 1.3;
  const boxH = lines.length * lh + size;
  const cy = before.bottom + h * 0.1 + boxH / 2;
  ctx.save();
  ctx.translate(w / 2, cy);
  ctx.scale(pop, pop);
  ctx.translate(-w / 2, -cy);
  ctx.fillStyle = p.accent;
  ctx.beginPath();
  ctx.roundRect(w * 0.08, cy - boxH / 2, w * 0.84, boxH, size * 0.8);
  ctx.fill();
  font(ctx, s.after, size);
  ctx.fillStyle = p.onAccent;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => ctx.fillText(l, w / 2, cy - (lines.length * lh) / 2 + lh * (i + 0.5)));
  ctx.restore();
}

function drawChart(f: Frame, s: Extract<Slide, { type: "chart" }>, language: string) {
  const { ctx, w, h, p, t } = f;
  const a = easeOutCubic(enter(t, 0.05));
  textBlock(f, s.label, { y: h * 0.16, size: Math.round(w * 0.07), maxLines: 2, color: p.text, alpha: a, dy: (1 - a) * 30 });
  const x0 = w * 0.1;
  const x1 = w * 0.9;
  const y0 = h * 0.58;
  const y1 = h * 0.27;
  // Bars start from zero when all values are positive, so the trend isn't exaggerated.
  const min = Math.min(0, ...s.values);
  const max = Math.max(...s.values);
  const span = max - min || 1;
  const pts = s.values.map((v, i) => [x0 + ((x1 - x0) * i) / (s.values.length - 1), y0 - ((v - min) / span) * (y0 - y1)] as [number, number]);
  ctx.strokeStyle = p.blob;
  ctx.lineWidth = 2;
  for (let g = 0; g <= 3; g++) {
    const y = y0 - ((y0 - y1) * g) / 3;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  }
  const prog = easeOutCubic(enter(t, 0.4, 1.4)) * (pts.length - 1);
  const whole = Math.floor(prog);
  const drawn = pts.slice(0, whole + 1);
  if (whole < pts.length - 1) {
    const [ax, ay] = pts[whole];
    const [bx, by] = pts[whole + 1];
    const k = prog - whole;
    drawn.push([ax + (bx - ax) * k, ay + (by - ay) * k]);
  }
  if (drawn.length >= 2) {
    ctx.fillStyle = p.blob;
    ctx.beginPath();
    ctx.moveTo(drawn[0][0], y0);
    drawn.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(drawn[drawn.length - 1][0], y0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = Math.max(6, w * 0.012);
    ctx.lineJoin = "round";
    ctx.beginPath();
    drawn.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    const [ex, ey] = drawn[drawn.length - 1];
    ctx.fillStyle = p.highlight;
    ctx.beginPath();
    ctx.arc(ex, ey, w * 0.02, 0, Math.PI * 2);
    ctx.fill();
  }
  if (prog >= pts.length - 1) {
    const e = easeOutBack(enter(t, 1.9, 0.4));
    textBlock(f, `${formatStat(s.values[s.values.length - 1], 1, language)}${s.suffix ?? ""}`, {
      y: h * 0.67,
      size: Math.round(w * 0.11),
      maxLines: 1,
      color: p.text,
      alpha: clamp01(e),
      scale: Math.max(0.01, e),
    });
  }
}

function drawCompare(f: Frame, s: Extract<Slide, { type: "compare" }>) {
  const { ctx, w, h, p, t } = f;
  const card = (y: number, side: { label: string; value: string }, e: number, strong: boolean) => {
    if (e <= 0) return;
    const pe = Math.max(0.01, easeOutBack(e));
    const ch = h * 0.16;
    ctx.save();
    ctx.globalAlpha *= clamp01(e * 1.5);
    ctx.translate(w / 2, y);
    ctx.scale(pe, pe);
    ctx.translate(-w / 2, -y);
    ctx.fillStyle = strong ? p.accent : p.blob;
    ctx.beginPath();
    ctx.roundRect(w * 0.1, y - ch / 2, w * 0.8, ch, w * 0.05);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    font(ctx, side.label, Math.round(w * 0.05));
    ctx.fillStyle = strong ? p.onAccent : p.muted;
    ctx.fillText(side.label, w / 2, y - ch * 0.22, w * 0.7);
    font(ctx, side.value, Math.round(w * 0.1));
    ctx.fillStyle = strong ? p.onAccent : p.text;
    ctx.fillText(side.value, w / 2, y + ch * 0.16, w * 0.7);
    ctx.restore();
  };
  card(h * 0.25, s.before, enter(t, 0.1, 0.5), false);
  const ar = easeOutCubic(enter(t, 0.7, 0.35));
  if (ar > 0) {
    ctx.strokeStyle = p.highlight;
    ctx.fillStyle = p.highlight;
    ctx.lineWidth = Math.max(6, w * 0.012);
    const ya = h * 0.35;
    const yb = ya + h * 0.07 * ar;
    ctx.beginPath();
    ctx.moveTo(w / 2, ya);
    ctx.lineTo(w / 2, yb);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w / 2 - w * 0.03, yb - w * 0.02);
    ctx.lineTo(w / 2, yb + w * 0.02);
    ctx.lineTo(w / 2 + w * 0.03, yb - w * 0.02);
    ctx.fill();
  }
  card(h * 0.53, s.after, enter(t, 1.0, 0.5), true);
}

function drawTimer(f: Frame, s: Extract<Slide, { type: "timer" }>) {
  const { w, h, p, t, d } = f;
  // Counts down over the slide (sped up for long timers, so the reel stays short).
  const run = Math.max(1, d - 1);
  const prog = clamp01((t - 0.3) / run);
  const left = Math.ceil(s.seconds * (1 - prog));
  ring(f.ctx, w / 2, h * 0.36, w * 0.3, w * 0.04, p.blob, prog >= 1 ? p.highlight : p.accent, 1 - prog);
  textBlock(f, `0:${String(left).padStart(2, "0")}`, { y: h * 0.36, size: Math.round(w * 0.15), maxLines: 1, color: p.text, alpha: 1, width: w * 0.5 });
  const a = easeOutCubic(enter(t, 0.3));
  textBlock(f, s.label, { y: h * 0.61, size: Math.round(w * 0.065), maxLines: 3, color: p.muted, alpha: a, dy: (1 - a) * 30 });
}

function drawQuestion(f: Frame, s: Extract<Slide, { type: "question" }>) {
  const { ctx, w, h, p, t } = f;
  const r = w * 0.17 * easeOutBack(enter(t, 0.05, 0.5));
  if (r > 1) {
    const cy = h * 0.24;
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(w / 2, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // A small tail turns the circle into a speech bubble.
    ctx.beginPath();
    ctx.moveTo(w / 2 + r * 0.25, cy + r * 0.9);
    ctx.lineTo(w / 2 + r * 0.7, cy + r * 1.35);
    ctx.lineTo(w / 2 + r * 0.75, cy + r * 0.55);
    ctx.fill();
    ctx.fillStyle = p.onAccent;
    font(ctx, "?", Math.round(r * 1.2));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", w / 2, cy);
  }
  const a = easeOutCubic(enter(t, 0.45));
  textBlock(f, s.text, { y: h * 0.46, size: Math.round(w * 0.085), maxLines: 4, color: p.text, alpha: a, dy: (1 - a) * 30 });
}

function drawCta(f: Frame, s: Extract<Slide, { type: "cta" }>) {
  const { ctx, w, h, p, t } = f;
  const pop = easeOutBack(enter(t, 0.05, 0.55));
  const head = textBlock(f, s.text, { y: h * 0.36, size: Math.round(w * 0.1), maxLines: 4, color: p.text, alpha: clamp01(pop * 1.4), scale: 0.85 + 0.15 * pop });
  if (!s.action) return;
  const a = easeOutBack(enter(t, 0.5, 0.5));
  const pulse = 1 + 0.035 * Math.sin(Math.max(0, t - 1) * 5);
  const size = Math.round(w * 0.058);
  font(ctx, s.action, size);
  const tw = Math.min(ctx.measureText(s.action).width, w * 0.7);
  const bw = (tw + size * 2) * pulse * a;
  const bh = size * 2.1 * pulse * a;
  const y = head.bottom + h * 0.08;
  if (bw <= 0 || bh <= 0) return;
  ctx.fillStyle = p.accent;
  ctx.beginPath();
  ctx.roundRect(w / 2 - bw / 2, y - bh / 2, bw, bh, bh / 2);
  ctx.fill();
  ctx.save();
  ctx.globalAlpha *= clamp01(a);
  ctx.fillStyle = p.onAccent;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(s.action, w / 2, y, w * 0.7);
  ctx.restore();
}

export interface CaptionTiming {
  narration: string;
  // Seconds of speech for this slide; speech starts 0.25 s into the slide.
  spoken: number;
}

// Which word is being spoken at time st: TTS gives no word timings, so time is shared out by word length.
export function activeWord(words: string[], spoken: number, st: number): number {
  const weights = words.map((x) => x.length + 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < words.length; i++) {
    acc += (spoken * weights[i]) / total;
    if (st < acc) return i;
  }
  return words.length - 1;
}

// The phrase being spoken, on a dark pill near the bottom (readable on any theme), current word in the accent colour.
function drawCaptions(f: Frame, cap: CaptionTiming) {
  const { ctx, w, h, p, t } = f;
  const st = t - 0.25;
  if (st < 0 || st > cap.spoken + 0.2) return;
  const chunks = chunkWords(cap.narration);
  const words = chunks.flatMap((c, ci) => c.split(" ").map((wd) => ({ wd, ci })));
  if (!words.length) return;
  const current = activeWord(words.map((x) => x.wd), cap.spoken, st);
  const chunk = chunks[words[current].ci];
  const size = Math.round(w * 0.055);
  const rtl = font(ctx, chunk, size);
  ctx.textBaseline = "middle";
  const y = h * 0.79;
  const textW = Math.min(ctx.measureText(chunk).width, w * 0.86);
  ctx.fillStyle = "rgba(10,10,14,0.72)";
  ctx.beginPath();
  ctx.roundRect(w / 2 - textW / 2 - size * 0.6, y - size * 0.95, textW + size * 1.2, size * 1.9, size * 0.5);
  ctx.fill();
  // On the dark pill the brand colour may be too dark; fall back to a bright yellow for the current word.
  const active = contrastRatio(p.accent, "#0a0a0e") >= 4.5 ? p.accent : "#ffd166";
  if (rtl) {
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(chunk, w / 2, y, w * 0.86);
    return;
  }
  const parts = chunk.split(" ");
  const activeInChunk = current - words.findIndex((x) => x.ci === words[current].ci);
  const space = ctx.measureText(" ").width;
  const widths = parts.map((x) => ctx.measureText(x).width);
  let x = w / 2 - (widths.reduce((a, b) => a + b, 0) + space * (parts.length - 1)) / 2;
  ctx.textAlign = "left";
  parts.forEach((wd, i) => {
    ctx.fillStyle = i === activeInChunk ? active : "#ffffff";
    ctx.fillText(wd, x, y);
    x += widths[i] + space;
  });
}

function chrome(f: Frame, total: number, watermark: boolean, handle?: string) {
  const { ctx, w, h, p, global } = f;
  // Thin progress bar at the top: viewers see how much is left, which helps them stay.
  ctx.fillStyle = p.blob;
  ctx.fillRect(0, 0, w, Math.max(5, h * 0.005));
  ctx.fillStyle = p.accent;
  ctx.fillRect(0, 0, w * clamp01(global / total), Math.max(5, h * 0.005));
  const small = Math.round(h / 52);
  ctx.direction = "ltr";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (handle) {
    ctx.font = `${Math.round(small * 1.1)}px 'Noto Sans'`;
    ctx.fillStyle = p.muted;
    ctx.fillText(handle, w / 2, h * 0.87);
  }
  // The AI label is always shown (platform disclosure); the free plan adds a note.
  const label = watermark ? `${AI_LABEL} · free plan` : AI_LABEL;
  ctx.font = `${small}px 'Noto Sans'`;
  const lw = ctx.measureText(label).width + 24;
  const lh = small * 1.8;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.roundRect(w / 2 - lw / 2, h - h / 20 - lh, lw, lh, 8);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText(label, w / 2, h - h / 20 - lh / 2);
}

export function drawFrame(
  f: Omit<Frame, "t" | "d"> & { slide: Slide; t: number; d: number; total: number; watermark: boolean; language: string; caption?: CaptionTiming; handle?: string },
) {
  background(f);
  // Each slide fades out over its last quarter second for a soft cut.
  f.ctx.save();
  f.ctx.globalAlpha = clamp01((f.d - f.t) / 0.25);
  const s = f.slide;
  switch (s.type) {
    case "title":
      drawTitle(f, s);
      break;
    case "list":
      drawList(f, s);
      break;
    case "stat":
      drawStat(f, s, f.language);
      break;
    case "quote":
      drawQuote(f, s);
      break;
    case "contrast":
      drawContrast(f, s);
      break;
    case "chart":
      drawChart(f, s, f.language);
      break;
    case "compare":
      drawCompare(f, s);
      break;
    case "timer":
      drawTimer(f, s);
      break;
    case "question":
      drawQuestion(f, s);
      break;
    case "cta":
      drawCta(f, s);
      break;
  }
  if (f.caption) drawCaptions(f, f.caption);
  f.ctx.restore();
  chrome(f, f.total, f.watermark, f.handle);
}

export interface RenderInput {
  script: MotionScript;
  durations: number[];
  narration: string[];
  // Seconds of speech per slide, for the captions.
  spoken?: number[];
  captions?: boolean;
  brand?: Brand;
  music?: string;
  width: number;
  height: number;
  watermark: boolean;
  fontsDir: string;
  output: string;
}

// FFmpeg arguments: raw RGBA frames on stdin, each narration delayed to its slide's start, music underneath.
export function motionFfmpegArgs(input: Pick<RenderInput, "durations" | "narration" | "music" | "width" | "height" | "output">): string[] {
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
  const p = brandPalette(input.brand ?? {}, THEMES[script.theme]);

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
    const caption = input.captions !== false && input.spoken ? { narration: script.slides[slide].narration, spoken: input.spoken[slide] } : undefined;
    drawFrame({
      ctx,
      w,
      h,
      p,
      global,
      slide: script.slides[slide],
      t: global - slideStart,
      d: durations[slide],
      total,
      watermark: input.watermark,
      language: script.language,
      caption,
      handle: input.brand?.handle,
    });
    const pixels = ctx.getImageData(0, 0, w, h).data;
    if (!ff.stdin.write(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength))) {
      await new Promise<void>((r) => ff.stdin.once("drain", () => r()));
    }
  }
  ff.stdin.end();
  await done;
}
