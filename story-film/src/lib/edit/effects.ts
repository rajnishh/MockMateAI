import type { Canvas, SKRSContext2D } from "@napi-rs/canvas";
import { clamp01, contrastRatio, easeOutBack, easeOutCubic, enter, fit, font, type Palette } from "@/lib/motion/render";
import type { Effect } from "./plan";
import type { FaceBox } from "./vision";

// A face box in screen pixels after the zoom crop.
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// The crop for a zoom of z: centred on the face when there is one, else a little above centre.
export function cropFor(z: number, face: FaceBox, w: number, h: number, focusY: number): { sx: number; sy: number; sw: number; sh: number } {
  const sw = w / z;
  const sh = h / z;
  const fx = face ? (face[0] + face[2] / 2) * w : w / 2;
  const fy = face ? (face[1] + face[3] / 2) * h : h * focusY;
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
  return { sx: clamp(fx - sw / 2, w - sw), sy: clamp(fy - sh / 2, h - sh), sw, sh };
}

export function faceOnScreen(face: FaceBox, crop: { sx: number; sy: number; sw: number }, w: number, h: number): Box | null {
  if (!face) return null;
  const z = w / crop.sw;
  return { x: (face[0] * w - crop.sx) * z, y: (face[1] * h - crop.sy) * z, w: face[2] * w * z, h: face[3] * h * z };
}

// Where a card's centre goes so it doesn't cover the face: lower middle by default.
export function cardY(face: Box | null, h: number, halfHeight = h * 0.12): number {
  const candidates = [0.6, 0.7, 0.3].map((f) => f * h);
  if (!face) return candidates[0];
  const top = face.y - face.h * 0.1;
  const bottom = face.y + face.h * 1.15;
  return candidates.find((cy) => cy + halfHeight < top || cy - halfHeight > bottom) ?? candidates[1];
}

export function effectAt(effects: Effect[], t: number): Effect | null {
  return effects.find((e) => t >= e.start && t <= e.end) ?? null;
}

// 0 → 1 over the first 0.3 s, back to 0 over the last 0.3 s.
export function effectAlpha(e: Effect, t: number): number {
  return Math.min(easeOutCubic(enter(t - e.start, 0, 0.3)), clamp01((e.end - t) / 0.3));
}

// Fills an RGBA buffer whose alpha is the person mask (0 where background, 255 where person).
export function maskToAlpha(gray: Buffer, rgba: Uint8ClampedArray): void {
  for (let i = 0, j = 3; i < gray.length; i++, j += 4) rgba[j] = gray[i];
}

// Text effects, drawn on the background layer (under the person).
export function drawBackdrop(ctx: SKRSContext2D, w: number, h: number, p: Palette, e: Extract<Effect, { type: "backdrop" }>, t: number, face: Box | null) {
  const a = effectAlpha(e, t);
  const grow = 1.25 - 0.25 * easeOutCubic(enter(t - e.start, 0, 0.5));
  const { size, lines } = fit(ctx, e.text.toUpperCase(), w * 0.94, Math.round(h * 0.2), 2);
  const rtl = font(ctx, e.text, size);
  ctx.save();
  ctx.globalAlpha = a;
  // Behind the head: centred a little above the face so the word peeks out on both sides.
  const cy = face ? Math.max(size, face.y + face.h * 0.2) : h * 0.35;
  ctx.translate(w / 2, cy);
  ctx.scale(grow, grow);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.fillStyle = contrastRatio(p.accent, "#000000") >= 7 ? p.accent : "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = size * 0.15;
  const lh = size * 1.0;
  lines.forEach((l, i) => ctx.fillText(l, 0, (i - (lines.length - 1) / 2) * lh));
  ctx.restore();
}

export function dimBackground(ctx: SKRSContext2D, w: number, h: number, amount: number) {
  ctx.fillStyle = `rgba(0,0,0,${amount.toFixed(3)})`;
  ctx.fillRect(0, 0, w, h);
}

// Draws the person layer: with a soft light around them (spotlight) or a white sticker outline (cutout).
export function drawPerson(ctx: SKRSContext2D, person: Canvas, white: Canvas | null, kind: "plain" | "glow" | "outline", amount: number, w: number) {
  ctx.save();
  if (kind === "glow") {
    ctx.shadowColor = `rgba(255,244,214,${(0.75 * amount).toFixed(3)})`;
    ctx.shadowBlur = w * 0.05;
  } else if (kind === "outline" && white) {
    const r = Math.round(w * 0.011);
    ctx.globalAlpha = amount;
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * Math.PI * 2;
      ctx.drawImage(white, Math.cos(ang) * r, Math.sin(ang) * r);
    }
    ctx.globalAlpha = 1;
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = w * 0.02;
    ctx.shadowOffsetY = w * 0.01;
  }
  ctx.drawImage(person, 0, 0);
  ctx.restore();
}

// Foreground effects, drawn over everything but captions.
export function drawStamp(ctx: SKRSContext2D, w: number, h: number, e: Extract<Effect, { type: "stamp" }>, t: number, face: Box | null) {
  const local = t - e.start;
  const a = clamp01((e.end - t) / 0.3);
  const slam = local < 0.18 ? 2.2 - 1.2 * easeOutCubic(local / 0.18) : 1;
  const shake = local > 0.18 && local < 0.4 ? Math.sin(local * 90) * w * 0.004 : 0;
  const size = Math.round(w * 0.085);
  font(ctx, e.text, size);
  const text = e.text.toUpperCase();
  const tw = Math.min(ctx.measureText(text).width, w * 0.6);
  // Beside the face, on the side with more room, at eye level.
  const right = !face || face.x + face.w / 2 < w / 2;
  const cx = face ? (right ? Math.min(w - tw / 2 - size, face.x + face.w + tw / 2 + size * 0.4) : Math.max(tw / 2 + size, face.x - tw / 2 - size * 0.4)) : w / 2;
  const cy = face ? face.y + face.h * 0.3 : h * 0.3;
  ctx.save();
  ctx.globalAlpha = a * clamp01(local / 0.08);
  ctx.translate(cx + shake, cy);
  ctx.rotate(right ? -0.14 : 0.14);
  ctx.scale(slam, slam);
  const color = "#e23b3b";
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.12;
  ctx.beginPath();
  ctx.roundRect(-tw / 2 - size * 0.45, -size * 0.75, tw + size * 0.9, size * 1.5, size * 0.2);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, size * 0.04, w * 0.6);
  ctx.restore();
}

export function drawFocus(ctx: SKRSContext2D, w: number, p: Palette, e: Extract<Effect, { type: "focus" }>, t: number, face: Box) {
  const a = effectAlpha(e, t);
  const lock = 1.5 - 0.5 * easeOutBack(enter(t - e.start, 0, 0.35));
  const cx = face.x + face.w / 2;
  const cy = face.y + face.h / 2;
  const bw = face.w * 1.35 * lock;
  const bh = face.h * 1.35 * lock;
  const arm = Math.min(bw, bh) * 0.22;
  const color = contrastRatio(p.accent, "#000000") >= 7 ? p.accent : "#ffffff";
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(4, w * 0.007);
  ctx.lineCap = "round";
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const x = cx + (sx * bw) / 2;
    const y = cy + (sy * bh) / 2;
    ctx.beginPath();
    ctx.moveTo(x, y - sy * arm);
    ctx.lineTo(x, y);
    ctx.lineTo(x - sx * arm, y);
    ctx.stroke();
  }
  if (e.label) {
    const size = Math.round(w * 0.04);
    font(ctx, e.label, size);
    const lw = ctx.measureText(e.label).width + size * 1.2;
    const ly = cy + bh / 2 + size * 1.4;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(cx - lw / 2, ly - size * 0.8, lw, size * 1.6, size * 0.8);
    ctx.fill();
    ctx.fillStyle = "#111111";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(e.label, cx, ly);
  }
  ctx.restore();
}
