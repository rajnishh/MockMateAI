// Timing rules for editing a planned video by hand: moving, stretching and adding moments,
// and fixing caption words. Plain TypeScript with no imports, so the mobile app keeps an exact
// copy (story-film/mobile/src/lib/moments.ts). Keep the two files the same, and in line with
// sanitizePlan in plan.ts, which applies the same limits on the server.

export type Span = { start: number; end: number };
export type Word = { word: string; start: number; end: number };
export type MomentKind = "effect" | "card" | "zoom";
export interface TimedPlan {
  zooms: Span[];
  cards: (Span & { type: string })[];
  effects: (Span & { type: string })[];
}

// Shortest and longest each kind of moment can be, in seconds.
export const LIMITS: Record<MomentKind, { min: number; max: number }> = {
  effect: { min: 0.8, max: 4 },
  card: { min: 1.5, max: 8 },
  zoom: { min: 0.5, max: 3 },
};
// How many of each a video can have.
export const MAX_COUNT: Record<MomentKind, number> = { effect: 6, card: 4, zoom: 20 };
// Gap needed after the previous moment of the same kind.
export const GAP: Record<MomentKind, number> = { effect: 0.5, card: 0, zoom: 1 };
// A new moment's length.
export const DEFAULT_LENGTH: Record<MomentKind, number> = { effect: 2, card: 3, zoom: 1.2 };
export const STEP = 0.25;
// Effects with text never share the screen with a card.
export const TEXT_EFFECTS = new Set(["backdrop", "stamp"]);

const round = (v: number) => Math.round(v * 100) / 100;
export const kindOf = (key: string): MomentKind => (key[0] === "e" ? "effect" : key[0] === "c" ? "card" : "zoom");

// Moves a moment by delta seconds, keeping its length, inside the video.
export function moveSpan(span: Span, delta: number, duration: number): Span {
  const len = span.end - span.start;
  const start = Math.max(0, Math.min(duration - len, span.start + delta));
  return { start: round(start), end: round(start + len) };
}

// Makes a moment longer or shorter by delta seconds, within its kind's limits and the video.
// Near the end it grows only up to the end, but never below its minimum (it moves earlier instead).
export function resizeSpan(span: Span, delta: number, kind: MomentKind, duration: number): Span {
  const { min, max } = LIMITS[kind];
  const len = Math.min(duration, Math.max(min, Math.min(max, span.end - span.start + delta, Math.max(duration - span.start, min))));
  const start = Math.max(0, Math.min(span.start, duration - len));
  return { start: round(start), end: round(start + len) };
}

// Where a new moment goes when added at time `at`.
export function newSpan(kind: MomentKind, at: number, duration: number): Span {
  const len = Math.min(DEFAULT_LENGTH[kind], duration);
  const start = Math.max(0, Math.min(at, duration - len));
  return { start: round(start), end: round(start + len) };
}

export const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

// Why a moment can't render as placed, keyed like "e0", "c1", "z2"; moments in `off` are ignored.
// The server would otherwise drop the later of two clashing moments without saying so.
export function conflicts(plan: TimedPlan, off: Set<string> = new Set()): Map<string, string> {
  const out = new Map<string, string>();
  const groups: [MomentKind, string, (Span & { type?: string })[]][] = [
    ["effect", "e", plan.effects],
    ["card", "c", plan.cards],
    ["zoom", "z", plan.zooms],
  ];
  for (const [kind, prefix, list] of groups) {
    const on = list.map((s, i) => ({ s, key: `${prefix}${i}` })).filter((x) => !off.has(x.key));
    on.sort((a, b) => a.s.start - b.s.start);
    for (let i = 0; i < on.length; i++) {
      const { s, key } = on[i];
      const len = s.end - s.start;
      if (len < LIMITS[kind].min - 1e-6) out.set(key, `Too short: make it at least ${LIMITS[kind].min} s.`);
      else if (len > LIMITS[kind].max + 1e-6) out.set(key, `Too long: ${LIMITS[kind].max} s at most.`);
      const prev = on[i - 1];
      if (prev && s.start < prev.s.end + GAP[kind] - 1e-6) {
        out.set(key, GAP[kind] ? `Too close to the one at ${formatTime(prev.s.start)}: leave ${GAP[kind]} s between them.` : `Overlaps the card at ${formatTime(prev.s.start)}.`);
      }
    }
    if (on.length > MAX_COUNT[kind]) for (const x of on.slice(MAX_COUNT[kind])) out.set(x.key, `At most ${MAX_COUNT[kind]} of these in one video.`);
  }
  const cards = plan.cards.map((c, i) => ({ c, key: `c${i}` })).filter((x) => !off.has(x.key));
  plan.effects.forEach((e, i) => {
    const key = `e${i}`;
    if (off.has(key) || !TEXT_EFFECTS.has(e.type) || out.has(key)) return;
    const card = cards.find((x) => e.start < x.c.end && x.c.start < e.end);
    if (card) out.set(key, `A card shows at ${formatTime(card.c.start)}: move this or turn that card off.`);
  });
  return out;
}

// Captions shown as editable lines: a new line after a pause or every 8 words.
export interface CaptionLine {
  from: number;
  to: number;
  start: number;
  end: number;
  text: string;
}

export function captionLines(words: Word[]): CaptionLine[] {
  const lines: CaptionLine[] = [];
  words.forEach((w, i) => {
    const last = lines[lines.length - 1];
    if (last && i - last.from < 8 && w.start - words[i - 1].end < 0.6) {
      last.to = i;
      last.end = w.end;
      last.text += ` ${w.word}`;
    } else lines.push({ from: i, to: i, start: w.start, end: w.end, text: w.word });
  });
  return lines;
}

// Replaces one line's words with the creator's text. Same number of words keeps each word's
// timing; otherwise the new words share the line's time evenly. Empty text removes the line.
export function editLine(words: Word[], line: CaptionLine, text: string): Word[] {
  const next = text.split(/\s+/).filter(Boolean).map((w) => w.slice(0, 40));
  const old = words.slice(line.from, line.to + 1);
  const span = (line.end - line.start) / Math.max(1, next.length);
  const replaced =
    next.length === old.length
      ? old.map((w, i) => ({ ...w, word: next[i] }))
      : next.map((word, i) => ({ word, start: round(line.start + i * span), end: round(line.start + (i + 1) * span) }));
  return [...words.slice(0, line.from), ...replaced, ...words.slice(line.to + 1)];
}

// Applies the creator's text for each line (lines from captionLines of the same words).
// Works from the last line back so earlier lines' word positions stay valid.
export function applyCaptionEdits(words: Word[], lines: CaptionLine[], texts: string[]): Word[] {
  let out = words;
  for (let i = lines.length - 1; i >= 0; i--) if (texts[i] !== undefined && texts[i] !== lines[i].text) out = editLine(out, lines[i], texts[i]);
  return out;
}

// Dragging on the timeline: move the whole moment, or pull its start or end edge.
export type DragMode = "move" | "start" | "end";

// Times worth snapping to: where each word starts (moments then begin on a word).
export function snapPoints(words: Word[]): number[] {
  return words.map((w) => w.start);
}

// The nearest snap point within `tolerance` seconds, else the time rounded to 0.05 s.
export function snapTime(t: number, points: number[], tolerance = 0.15): number {
  let best = t;
  let bestGap = tolerance;
  for (const p of points) {
    const gap = Math.abs(p - t);
    if (gap <= bestGap) {
      best = p;
      bestGap = gap;
    }
  }
  return best === t ? Math.round(t * 20) / 20 : best;
}

// Where a moment ends up after dragging by delta seconds from where the drag began.
export function dragSpan(origin: Span, mode: DragMode, delta: number, kind: MomentKind, duration: number, points: number[] = []): Span {
  const { min, max } = LIMITS[kind];
  if (mode === "move") {
    const len = origin.end - origin.start;
    const start = Math.max(0, Math.min(duration - len, snapTime(origin.start + delta, points)));
    return { start: round(start), end: round(start + len) };
  }
  if (mode === "start") {
    const start = Math.max(0, origin.end - max, Math.min(origin.end - min, snapTime(origin.start + delta, points)));
    return { start: round(start), end: origin.end };
  }
  const end = Math.min(duration, origin.start + max, Math.max(origin.start + min, snapTime(origin.end + delta, points)));
  return { start: origin.start, end: round(end) };
}

// Timeline zoom, in pixels per second: from the whole video fitting the view up to 240 px/s.
// Past WORD_ZOOM the captions lane shows single words, which can then be retimed.
export const MAX_ZOOM = 240;
export const WORD_ZOOM = 90;
export function fitZoom(viewWidth: number, duration: number): number {
  return Math.max(4, Math.min(MAX_ZOOM, viewWidth / Math.max(1, duration)));
}
export function clampZoom(pps: number, viewWidth: number, duration: number): number {
  return Math.max(fitZoom(viewWidth, duration), Math.min(MAX_ZOOM, pps));
}
// Scroll offset that keeps the time under `focusX` (pixels from the view's left) in place after a zoom.
export function scrollForZoom(scrollX: number, focusX: number, from: number, to: number): number {
  return Math.max(0, ((scrollX + focusX) / from) * to - focusX);
}

// Retimes one caption word by dragging: it never overlaps its neighbours or leaves the video,
// and stays at least 0.05 s long.
export const WORD_STEP = 0.05;
export function dragWord(words: Word[], i: number, origin: Span, mode: DragMode, delta: number, duration: number): Word[] {
  const lo = i > 0 ? words[i - 1].end : 0;
  const hi = i < words.length - 1 ? words[i + 1].start : duration;
  const r = (v: number) => Math.round(v * 100) / 100;
  let { start, end } = origin;
  if (mode === "move") {
    const len = end - start;
    if (hi - lo < len) return words;
    start = Math.max(lo, Math.min(hi - len, start + delta));
    end = start + len;
  } else if (mode === "start") start = Math.max(lo, Math.min(end - WORD_STEP, start + delta));
  else end = Math.min(hi, Math.max(start + WORD_STEP, end + delta));
  return words.map((w, j) => (j === i ? { ...w, start: r(start), end: r(end) } : w));
}
