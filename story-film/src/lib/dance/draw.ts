import type { SKRSContext2D } from "@napi-rs/canvas";
import { activeWord, clamp01, easeOutBack, font } from "@/lib/motion/render";
import { AI_LABEL } from "@/lib/pipeline/assemble";
import { chunkWords } from "@/lib/pipeline/captions";
import { beatSec, type DanceMove, type DanceScript, type Dancer, type Segment } from "./script";

// Draws one frame of a dance reel: the scene, cartoon kids dancing on the beat, the chant as
// bouncing captions, and the AI label. All sizes are for 1080x1920 and scale with the height.

const SKIN: Record<Dancer["skin"], [string, string]> = {
  light: ["#f7cfa8", "#e9b48a"],
  medium: ["#dca472", "#c88b58"],
  deep: ["#a46a44", "#8a5434"],
};
const HAIR_COLOUR = "#2a1810";
const INK = "#2a1235";
const GOLD = "#ffd34d";

// A dancer's pose. Arm angles are from straight down; positive swings the arm outward, past PI is overhead.
interface Pose {
  lift: number;
  lean: number;
  turn: number;
  squash: number;
  arm: [number, number, number, number];
  feet: [number, number];
  tilt: number;
  clap: number;
}

const smooth = (x: number) => x * x * (3 - 2 * x);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function shade(hex: string, k: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(Math.max(0, Math.min(255, k < 0 ? c * (1 + k) : c + (255 - c) * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// The pose for a move at a time measured in beats. Each move is a short loop locked to the beat.
export function poseFor(move: DanceMove, beats: number): Pose {
  const b = Math.floor(beats);
  const phase = beats - b;
  const up = Math.sin(Math.PI * phase);
  const side = b % 2 ? 1 : -1;
  switch (move) {
    case "clap": {
      const c = smooth(clamp01(1 - Math.abs(phase < 0.5 ? phase : phase - 1) * 2.4));
      return { lift: 10 * up, lean: 0, turn: 1, squash: 1, arm: [lerp(0.5, -0.3, c), lerp(0.4, -1.45, c), lerp(0.5, -0.3, c), lerp(0.4, -1.45, c)], feet: [0, 0], tilt: 0.06 * side, clap: c };
    }
    case "wave": {
      const sway = Math.sin(Math.PI * beats);
      return { lift: 6 * up, lean: 0.1 * sway, turn: 1, squash: 1, arm: [2.65 + 0.2 * sway, 0.5 * Math.sin(2 * Math.PI * beats), 2.65 - 0.2 * sway, 0.5 * Math.sin(2 * Math.PI * beats + 1)], feet: [0, 0], tilt: 0.08 * sway, clap: 0 };
    }
    case "spin": {
      const turn = Math.cos(2 * Math.PI * ((b % 4) + phase) / 4);
      return { lift: 12 * up, lean: 0, turn, squash: 1, arm: [1.35, 0.2, 1.35, 0.2], feet: [8 * side, -8 * side], tilt: 0, clap: 0 };
    }
    case "jump": {
      const air = b % 2 === 0 ? up : 0;
      const land = b % 2 === 1 ? Math.exp(-phase * 10) : 0;
      return { lift: 95 * air, lean: 0, turn: 1, squash: 1 - 0.1 * land, arm: [lerp(0.6, 2.75, air), lerp(0.3, 0.1, air), lerp(0.6, 2.75, air), lerp(0.3, 0.1, air)], feet: [-14 * air, 14 * air], tilt: 0, clap: 0 };
    }
    case "twist": {
      const sway = Math.sin(Math.PI * beats);
      return { lift: 8 * up, lean: 0.17 * sway, turn: 1, squash: 1, arm: [0.95 + 0.35 * sway, 1.5, 0.95 - 0.35 * sway, 1.5], feet: [18 * sway, 18 * sway], tilt: -0.1 * sway, clap: 0 };
    }
    default:
      return { lift: 22 * up, lean: 0, turn: 1, squash: 1 - 0.04 * (1 - up), arm: [0.35 + 0.3 * up * side, 0.3, 0.35 - 0.3 * up * side, 0.3], feet: [0, 0], tilt: 0.07 * side, clap: 0 };
  }
}

function mix(a: Pose, b: Pose, k: number): Pose {
  return {
    lift: lerp(a.lift, b.lift, k),
    lean: lerp(a.lean, b.lean, k),
    turn: lerp(a.turn, b.turn, k),
    squash: lerp(a.squash, b.squash, k),
    arm: a.arm.map((v, i) => lerp(v, b.arm[i], k)) as Pose["arm"],
    feet: [lerp(a.feet[0], b.feet[0], k), lerp(a.feet[1], b.feet[1], k)],
    tilt: lerp(a.tilt, b.tilt, k),
    clap: lerp(a.clap, b.clap, k),
  };
}

function limb(ctx: SKRSContext2D, pts: [number, number][], width: number, colour: string) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.stroke();
}

function arm(ctx: SKRSContext2D, side: -1 | 1, a1: number, a2: number, sleeve: string, skin: string) {
  const sx = side * 58;
  const sy = -272;
  const dir = (a: number) => [side * Math.sin(a), Math.cos(a)];
  const [ux, uy] = dir(a1);
  const ex = sx + ux * 68;
  const ey = sy + uy * 68;
  const [lx, ly] = dir(a1 + a2);
  const hx = ex + lx * 62;
  const hy = ey + ly * 62;
  limb(ctx, [[sx, sy], [ex, ey]], 30, sleeve);
  limb(ctx, [[ex, ey], [hx, hy]], 24, skin);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(hx, hy, 17, 0, Math.PI * 2);
  ctx.fill();
}

function hairBack(ctx: SKRSContext2D, hair: Dancer["hair"], accent: string) {
  ctx.fillStyle = HAIR_COLOUR;
  if (hair === "ponytails") {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * 98, -405, 30, 44, s * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = accent;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * 82, -425, 13, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (hair === "plait") {
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(70 + i * 4, -330 + i * 34, 22 - i * 2, 20, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(88, -170, 11, 0, Math.PI * 2);
    ctx.fill();
  } else if (hair === "bun") {
    ctx.beginPath();
    ctx.arc(0, -478, 38, 0, Math.PI * 2);
    ctx.fill();
  }
}

function hairFront(ctx: SKRSContext2D, hair: Dancer["hair"], accent: string) {
  ctx.fillStyle = HAIR_COLOUR;
  if (hair === "curly") {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (1.05 + (i / 8) * 0.9);
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 88, -378 + Math.sin(a) * 88, 30, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  // A cap of hair over the top of the head with a soft fringe.
  ctx.beginPath();
  ctx.arc(0, -378, 96, Math.PI * 1.02, Math.PI * 1.98);
  ctx.quadraticCurveTo(60, -380, 20, -400);
  ctx.quadraticCurveTo(-10, -380, -45, -398);
  ctx.quadraticCurveTo(-80, -370, -95, -385);
  ctx.closePath();
  ctx.fill();
  if (hair === "bun") {
    ctx.fillStyle = accent;
    ctx.fillRect(-26, -452, 52, 10);
  }
}

function face(ctx: SKRSContext2D, skin: [string, string], blink: boolean, mouth: number) {
  ctx.fillStyle = skin[0];
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * 92, -370, 18, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, -378, 92, 0, Math.PI * 2);
  ctx.fill();
  // Eyes: big and dark with a sparkle, closed for a moment when blinking.
  for (const s of [-1, 1]) {
    if (blink) {
      limb(ctx, [[s * 34 - 12, -372], [s * 34 + 12, -372]], 6, INK);
      continue;
    }
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(s * 34, -372, 13, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(s * 34 + 4, -378, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255,110,110,0.35)";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * 56, -340, 16, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Mouth: a smile that opens while the kids chant.
  ctx.fillStyle = "#7a1f2b";
  ctx.beginPath();
  ctx.moveTo(-20, -336);
  ctx.quadraticCurveTo(0, -336 + 12 + 22 * mouth, 20, -336);
  ctx.quadraticCurveTo(0, -330, -20, -336);
  ctx.fill();
  if (mouth > 0.3) {
    ctx.fillStyle = "#ff7f8f";
    ctx.beginPath();
    ctx.ellipse(0, -326 + 8 * mouth, 9, 5 * mouth, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function outfit(ctx: SKRSContext2D, d: Dancer, skin: string) {
  const c = d.color;
  const dark = shade(c, -0.25);
  if (d.outfit === "lehenga") {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.roundRect(-58, -292, 116, 84, 22);
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(-54, -212);
    ctx.lineTo(54, -212);
    ctx.quadraticCurveTo(110, -110, 130, -28);
    ctx.quadraticCurveTo(0, -12, -130, -28);
    ctx.quadraticCurveTo(-110, -110, -54, -212);
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(-126, -40);
    ctx.quadraticCurveTo(0, -24, 126, -40);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(i * 26, -120 + Math.abs(i) * 6, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  if (d.outfit === "frock") {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(-50, -292);
    ctx.lineTo(50, -292);
    ctx.quadraticCurveTo(90, -170, 112, -92);
    ctx.quadraticCurveTo(0, -78, -112, -92);
    ctx.quadraticCurveTo(-90, -170, -50, -292);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(0, -290, 46, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-108, -100);
    ctx.quadraticCurveTo(0, -86, 108, -100);
    ctx.stroke();
    return;
  }
  if (d.outfit === "shirt") {
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.roundRect(-56, -176, 112, 64, 14);
    ctx.fill();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.roundRect(-60, -294, 120, 128, 26);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, -262 + i * 32, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    void skin;
    return;
  }
  // Kurta: a long tunic with a gold collar and buttons.
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.moveTo(-58, -294);
  ctx.lineTo(58, -294);
  ctx.quadraticCurveTo(72, -180, 76, -92);
  ctx.lineTo(-76, -92);
  ctx.quadraticCurveTo(-72, -180, -58, -294);
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-24, -294);
  ctx.lineTo(0, -262);
  ctx.lineTo(24, -294);
  ctx.moveTo(0, -262);
  ctx.lineTo(0, -196);
  ctx.moveTo(-74, -100);
  ctx.lineTo(74, -100);
  ctx.stroke();
}

export interface DancerState {
  dancer: Dancer;
  x: number;
  floor: number;
  scale: number;
  pose: Pose;
  blink: boolean;
  mouth: number;
}

export function drawDancer(ctx: SKRSContext2D, s: DancerState) {
  const { dancer: d, pose } = s;
  const skin = SKIN[d.skin];
  const accent = shade(d.color, 0.45);
  // Shadow on the floor shrinks as the dancer jumps.
  ctx.save();
  ctx.translate(s.x, s.floor);
  ctx.scale(s.scale, s.scale);
  ctx.fillStyle = "rgba(42,18,53,0.18)";
  const shadow = 1 - Math.min(0.5, pose.lift / 200);
  ctx.beginPath();
  ctx.ellipse(0, 6, 110 * shadow, 18 * shadow, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(0, -pose.lift);
  ctx.rotate(pose.lean);
  // Turning narrows the dancer, but never to a sliver: it should still read as a kid spinning.
  const turn = 0.45 + 0.55 * Math.abs(pose.turn);
  ctx.scale(turn, pose.squash);
  const back = pose.turn < 0;

  // Legs and shoes. Long outfits cover the top of the legs.
  const legColour = d.outfit === "shirt" ? skin[0] : d.outfit === "kurta" ? "#fff1dc" : skin[0];
  for (const [i, sx] of [-1, 1].entries()) {
    const fx = sx * 34 + pose.feet[i];
    const fy = -Math.max(0, -pose.feet[i] * 0) - (pose.lift > 40 ? 18 : 0);
    limb(ctx, [[sx * 26, -132], [sx * 30 + pose.feet[i] * 0.5, -66], [fx, fy - 12]], 30, legColour);
    ctx.fillStyle = d.outfit === "lehenga" ? GOLD : "#c2410c";
    ctx.beginPath();
    ctx.ellipse(fx + sx * 6, fy - 6, 26, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (back) {
    hairBack(ctx, d.hair, accent);
    arm(ctx, -1, pose.arm[0], pose.arm[1], shade(d.color, -0.1), skin[1]);
    arm(ctx, 1, pose.arm[2], pose.arm[3], shade(d.color, -0.1), skin[1]);
    outfit(ctx, d, skin[0]);
    ctx.fillStyle = skin[1];
    ctx.fillRect(-20, -306, 40, 22);
    ctx.fillStyle = HAIR_COLOUR;
    ctx.beginPath();
    ctx.arc(0, -378, 94, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  hairBack(ctx, d.hair, accent);
  outfit(ctx, d, skin[0]);
  ctx.fillStyle = skin[1];
  ctx.fillRect(-20, -306, 40, 22);
  ctx.save();
  ctx.translate(0, -300);
  ctx.rotate(pose.tilt);
  ctx.translate(0, 300);
  face(ctx, skin, s.blink, s.mouth);
  hairFront(ctx, d.hair, accent);
  ctx.restore();
  arm(ctx, -1, pose.arm[0], pose.arm[1], shade(d.color, -0.1), skin[0]);
  arm(ctx, 1, pose.arm[2], pose.arm[3], shade(d.color, -0.1), skin[0]);
  // A little burst where the hands meet on a clap.
  if (pose.clap > 0.85) {
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 6;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 34, -228 + Math.sin(a) * 34);
      ctx.lineTo(Math.cos(a) * 54, -228 + Math.sin(a) * 54);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// --- Scenes ---------------------------------------------------------------

function garland(ctx: SKRSContext2D, x0: number, x1: number, y: number, sag: number, beats: number) {
  const n = 22;
  const swing = Math.sin(Math.PI * beats) * 10;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const x = lerp(x0, x1, k);
    const yy = y + Math.sin(Math.PI * k) * (sag + swing);
    ctx.fillStyle = i % 2 ? "#ff9f1c" : "#ffd23f";
    ctx.beginPath();
    ctx.arc(x, yy, 17, 0, Math.PI * 2);
    ctx.fill();
  }
}

function petals(ctx: SKRSContext2D, w: number, h: number, t: number, count: number) {
  for (let i = 0; i < count; i++) {
    const seed = Math.sin(i * 91.7) * 10000;
    const r = seed - Math.floor(seed);
    const speed = 120 + r * 160;
    const x = (r * 1.7 * w + Math.sin(t * 1.3 + i) * 40) % w;
    const y = ((t * speed + r * h * 3) % (h * 0.95)) - 40;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 2 + i);
    ctx.fillStyle = i % 3 === 0 ? "#ffd23f" : i % 3 === 1 ? "#ff9f1c" : "#ff5a3c";
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function scene(ctx: SKRSContext2D, w: number, h: number, kind: DanceScript["scene"], beats: number, t: number) {
  const floor = h * 0.64;
  const pulse = Math.exp(-(beats % 1) * 5);
  if (kind === "park") {
    const sky = ctx.createLinearGradient(0, 0, 0, floor);
    sky.addColorStop(0, "#7cc8ff");
    sky.addColorStop(1, "#dff4ff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, floor);
    ctx.fillStyle = "#ffd23f";
    ctx.beginPath();
    ctx.arc(w * 0.82, h * 0.12, 80 + 8 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (let i = 0; i < 3; i++) {
      const cx = ((t * 30 + i * 420) % (w + 300)) - 150;
      const cy = h * (0.18 + i * 0.07);
      for (const [dx, r] of [[0, 46], [50, 60], [105, 44]]) {
        ctx.beginPath();
        ctx.arc(cx + dx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = "#5fbf5a";
    ctx.beginPath();
    ctx.ellipse(w * 0.2, floor + 40, w * 0.5, 180, 0, Math.PI, 0);
    ctx.ellipse(w * 0.85, floor + 60, w * 0.45, 200, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#7ccf5b";
    ctx.fillRect(0, floor, w, h - floor);
    return;
  }
  if (kind === "stage") {
    ctx.fillStyle = "#2a1235";
    ctx.fillRect(0, 0, w, floor);
    for (let i = 0; i < 3; i++) {
      const a = Math.sin(t * 0.8 + i * 2) * 0.25;
      ctx.save();
      ctx.translate(w * (0.2 + i * 0.3), 0);
      ctx.rotate(a);
      const g = ctx.createLinearGradient(0, 0, 0, floor);
      g.addColorStop(0, "rgba(255,226,140,0.35)");
      g.addColorStop(1, "rgba(255,226,140,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-20, 0);
      ctx.lineTo(20, 0);
      ctx.lineTo(220, floor);
      ctx.lineTo(-220, floor);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = "#c81d3a";
    for (const s of [0, 1]) {
      ctx.beginPath();
      const x = s ? w : 0;
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (s ? -170 : 170), 0);
      ctx.quadraticCurveTo(x + (s ? -90 : 90), floor * 0.5, x + (s ? -130 : 130), floor);
      ctx.lineTo(x, floor);
      ctx.fill();
    }
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = (i + Math.floor(beats)) % 2 ? "#ffd23f" : "#ff9f1c";
      ctx.beginPath();
      ctx.arc(60 + i * 74, 70 + Math.sin(i) * 12, 12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#8a5a3c";
    ctx.fillRect(0, floor, w, h - floor);
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 3;
    for (let x = -w; x < w * 2; x += 120) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + (x - w / 2) * 0.4, floor);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    return;
  }
  // Courtyard: a warm wall with arches, marigold garlands and a tiled floor.
  const wall = ctx.createLinearGradient(0, 0, 0, floor);
  wall.addColorStop(0, "#ffe2b0");
  wall.addColorStop(1, "#ffc98a");
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, w, floor);
  ctx.fillStyle = "#f2a96b";
  for (const cx of [w * 0.2, w * 0.5, w * 0.8]) {
    ctx.beginPath();
    ctx.moveTo(cx - 120, floor);
    ctx.lineTo(cx - 120, h * 0.36);
    ctx.arc(cx, h * 0.36, 120, Math.PI, 0);
    ctx.lineTo(cx + 120, floor);
    ctx.fill();
  }
  ctx.fillStyle = "#e88a4d";
  for (const cx of [w * 0.2, w * 0.5, w * 0.8]) {
    ctx.beginPath();
    ctx.moveTo(cx - 88, floor);
    ctx.lineTo(cx - 88, h * 0.38);
    ctx.arc(cx, h * 0.38, 88, Math.PI, 0);
    ctx.lineTo(cx + 88, floor);
    ctx.fill();
  }
  garland(ctx, -20, w + 20, h * 0.06, 110, beats);
  garland(ctx, -20, w * 0.55, h * 0.16, 70, beats + 0.5);
  garland(ctx, w * 0.45, w + 20, h * 0.16, 70, beats + 0.5);
  ctx.fillStyle = "#e9a978";
  ctx.fillRect(0, floor, w, h - floor);
  ctx.strokeStyle = "rgba(122,60,30,0.18)";
  ctx.lineWidth = 3;
  for (let x = -w; x < w * 2; x += 140) {
    ctx.beginPath();
    ctx.moveTo(w / 2 + (x - w / 2) * 0.35, floor);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = floor + 60; y < h; y += 90 + (y - floor) * 0.25) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  // A rangoli under the dancers that glows on the beat.
  ctx.save();
  ctx.translate(w / 2, floor + h * 0.07);
  ctx.scale(1, 0.32);
  for (const [r, c] of [[300, "#ff5a3c"], [230, "#ffd23f"], [160, "#14d9a0"], [90, "#c81d7a"]] as const) {
    ctx.globalAlpha = 0.55 + 0.3 * pulse;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// --- Text -----------------------------------------------------------------

function titleCard(ctx: SKRSContext2D, w: number, h: number, title: string, k: number, small: boolean) {
  const size = small ? Math.round(h / 34) : Math.round(h / 17);
  font(ctx, title, size);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const tw = Math.min(ctx.measureText(title).width, w * 0.84);
  const y = small ? h * 0.045 + 18 : h * 0.3;
  ctx.save();
  ctx.translate(w / 2, y);
  ctx.scale(k, k);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(-tw / 2 - size * 0.6, -size * 0.85, tw + size * 1.2, size * 1.7, size * 0.6);
  ctx.fill();
  ctx.fillStyle = "#ffb21a";
  ctx.fillText(title, 0, size * 0.05, w * 0.84);
  ctx.restore();
}

// The chant line on a plum pill, bouncing on each beat, the word being sung in saffron.
function chant(ctx: SKRSContext2D, w: number, h: number, text: string, sinceStart: number, spoken: number, beats: number) {
  const chunks = chunkWords(text);
  const words = chunks.flatMap((c, ci) => c.split(" ").map((wd) => ({ wd, ci })));
  if (!words.length) return;
  const current = sinceStart <= spoken ? activeWord(words.map((x) => x.wd), spoken, Math.max(0, sinceStart)) : words.length - 1;
  const chunk = chunks[words[current].ci];
  const size = Math.round(w * 0.075);
  const rtl = font(ctx, chunk, size);
  ctx.textBaseline = "middle";
  const bounce = 1 + 0.06 * Math.exp(-(beats % 1) * 6);
  const pop = easeOutBack(clamp01(sinceStart / 0.25));
  const y = h * 0.8;
  const textW = Math.min(ctx.measureText(chunk).width, w * 0.86);
  ctx.save();
  ctx.translate(w / 2, y);
  ctx.scale(bounce * pop, bounce * pop);
  ctx.fillStyle = "rgba(42,18,53,0.88)";
  ctx.beginPath();
  ctx.roundRect(-textW / 2 - size * 0.55, -size * 0.9, textW + size * 1.1, size * 1.8, size * 0.5);
  ctx.fill();
  if (rtl) {
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(chunk, 0, 0, w * 0.86);
    ctx.restore();
    return;
  }
  const parts = chunk.split(" ");
  const activeInChunk = current - words.findIndex((x) => x.ci === words[current].ci);
  const space = ctx.measureText(" ").width;
  const widths = parts.map((x) => ctx.measureText(x).width);
  let x = -(widths.reduce((a, b) => a + b, 0) + space * (parts.length - 1)) / 2;
  ctx.textAlign = "left";
  parts.forEach((wd, i) => {
    ctx.fillStyle = i === activeInChunk && sinceStart <= spoken + 0.2 ? "#ffb21a" : "#ffffff";
    ctx.fillText(wd, x, 0);
    x += widths[i] + space;
  });
  ctx.restore();
}

function label(ctx: SKRSContext2D, w: number, h: number, watermark: boolean, handle?: string) {
  const small = Math.round(h / 52);
  ctx.direction = "ltr";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (handle) {
    ctx.font = `${Math.round(small * 1.1)}px 'Noto Sans'`;
    ctx.fillStyle = "rgba(42,18,53,0.85)";
    ctx.fillText(handle, w / 2, h * 0.875);
  }
  const text = watermark ? `${AI_LABEL} · free plan` : AI_LABEL;
  ctx.font = `${small}px 'Noto Sans'`;
  const lw = ctx.measureText(text).width + 24;
  const lh = small * 1.8;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.roundRect(w / 2 - lw / 2, h - h / 20 - lh, lw, lh, 8);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(text, w / 2, h - h / 20 - lh / 2);
}

// --- Frame ----------------------------------------------------------------

export interface DanceFrame {
  ctx: SKRSContext2D;
  w: number;
  h: number;
  t: number;
  script: DanceScript;
  segments: Segment[];
  // Seconds of voice per chant line.
  spoken: number[];
  watermark: boolean;
  handle?: string;
  captions?: boolean;
}

const BLEND_SEC = 0.3;

export function drawDanceFrame(f: DanceFrame) {
  const { ctx, w, h, t, script, segments } = f;
  const beat = beatSec(script.bpm);
  const beats = t / beat;
  const i = Math.max(0, segments.findIndex((s) => t >= s.start && t < s.end));
  const seg = segments[i] ?? segments.at(-1)!;
  const prev = segments[i - 1];

  // Scenes are drawn on a 1080x1920 grid and scaled to the frame.
  const finale = seg.line === -2;
  ctx.save();
  ctx.scale(w / 1080, h / 1920);
  scene(ctx, 1080, 1920, script.scene, beats, t);
  petals(ctx, 1080, 1920, t, finale ? 46 : 18);
  ctx.restore();

  const n = script.dancers.length;
  const floor = h * 0.715;
  const scale = (h / 1920) * [1.5, 1.35, 1.2, 0.98][n - 1];
  const spread = n >= 3 ? 0.3 : 0.18;
  const xAt = (k: number) => (n === 1 ? w / 2 : w * (0.5 - spread + (2 * spread * k) / (n - 1)));
  const voice = seg.line >= 0 && t - seg.start <= (f.spoken[seg.line] ?? 0);
  script.dancers.forEach((dancer, k) => {
    // Slightly different timing and size per kid, so they look like kids, not clones.
    const lag = k * 0.04;
    let pose = poseFor(seg.move, beats - lag);
    const into = (t - seg.start) / BLEND_SEC;
    if (prev && into < 1) pose = mix(poseFor(prev.move, beats - lag), pose, smooth(clamp01(into)));
    const blink = ((t + k * 1.3) % 3.4) < 0.12;
    const mouth = voice ? 0.35 + 0.65 * Math.abs(Math.sin((t + k * 0.1) * 13)) : 0.15;
    drawDancer(ctx, { dancer, x: xAt(k), floor: floor + (k % 2) * h * 0.012, scale: scale * (1 - (k % 2) * 0.04), pose, blink, mouth });
  });

  if (seg.line === -1) titleCard(ctx, w, h, script.title, easeOutBack(clamp01(t / 0.5)), false);
  else titleCard(ctx, w, h, script.title, 1, true);
  if (f.captions !== false && seg.line >= 0) chant(ctx, w, h, script.lines[seg.line].text, t - seg.start, f.spoken[seg.line] ?? 0, beats);
  // The hook comes back in the finale only when its voice fits there (see voicePlacements).
  const hookFits = seg.end - seg.start >= (f.spoken[0] ?? 0) + 0.1;
  if (finale && hookFits && f.captions !== false) chant(ctx, w, h, script.lines[0].text, t - seg.start, f.spoken[0] ?? 0, beats);

  // Thin progress bar at the top.
  ctx.fillStyle = "rgba(42,18,53,0.15)";
  ctx.fillRect(0, 0, w, Math.max(5, h * 0.005));
  ctx.fillStyle = "#ff7a1a";
  ctx.fillRect(0, 0, w * clamp01(t / segments.at(-1)!.end), Math.max(5, h * 0.005));
  label(ctx, w, h, f.watermark, f.handle);
}
