// The four kinds of music video, and the shot list: shots cut on downbeats, each one a singing,
// dancing, story or lyric shot.
import type { BeatGrid } from "./beats";
import type { TimedLine } from "./timing";

export const MUSIC_VIDEO_KINDS = ["lyric", "story", "performance", "full"] as const;
export type MusicVideoKind = (typeof MUSIC_VIDEO_KINDS)[number];

export const SHOT_TYPES = ["sing", "dance", "scene", "lyric"] as const;
export type ShotType = (typeof SHOT_TYPES)[number];

export const DANCE_STYLES = ["bollywood", "bhangra", "hiphop", "garba", "kids"] as const;
export type DanceStyle = (typeof DANCE_STYLES)[number];

export interface PlannedShot {
  start: number;
  end: number;
  type: ShotType;
  lines: string[];
}

// Shot lengths in seconds per kind. AI video models make 3 s or more; dance shots copy a 5 s
// reference clip, so the full video keeps shots at 5 s or less.
export const SHOT_SECONDS: Record<MusicVideoKind, { min: number; target: number; max: number }> = {
  lyric: { min: 3, target: 5, max: 8 },
  story: { min: 3, target: 5, max: 7 },
  performance: { min: 3, target: 6, max: 9 },
  full: { min: 2.5, target: 4, max: 5 },
};

// Which shot types a creator may pick for each kind in the storyboard.
export const KIND_SHOT_TYPES: Record<MusicVideoKind, ShotType[]> = {
  lyric: ["lyric"],
  story: ["scene"],
  performance: ["sing", "scene"],
  full: ["sing", "dance", "scene"],
};

// The full music video's mix, by screen time.
export const FULL_MIX: Record<"sing" | "dance" | "scene", number> = { sing: 0.4, dance: 0.25, scene: 0.35 };

// Cuts the song into shots that start and end on downbeats, preferring a cut where a lyric
// line starts. Shots are between min and max seconds where the beat allows it.
export function cutOnDownbeats(durationSec: number, grid: BeatGrid, timed: TimedLine[], sec: { min: number; target: number; max: number }): { start: number; end: number }[] {
  const cuts = grid.downbeats.filter((d) => d > 0.05 && d < durationSec - 0.05);
  const lineStarts = timed.map((l) => l.start);
  const shots: { start: number; end: number }[] = [];
  let t = 0;
  while (durationSec - t > 0.05) {
    const remaining = durationSec - t;
    let end: number;
    if (remaining <= sec.max) end = durationSec;
    else {
      const options = cuts.filter((c) => c >= t + sec.min && c <= t + sec.max);
      if (!options.length) end = t + sec.target;
      else {
        // A downbeat close to a line start wins; otherwise the one nearest the target length.
        const score = (c: number) => Math.abs(c - t - sec.target) - (lineStarts.some((s) => Math.abs(s - c) < 0.5) ? sec.target : 0);
        end = options.sort((a, b) => score(a) - score(b))[0];
      }
      // Don't leave a sliver at the end: split what's left in two, on a downbeat if one fits.
      if (durationSec - end < sec.min) {
        const mid = t + remaining / 2;
        const near = cuts.filter((c) => c >= t + sec.min && c <= durationSec - sec.min).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0];
        end = near ?? mid;
      }
    }
    shots.push({ start: round(t), end: round(end) });
    t = end;
  }
  return shots;
}

const linesIn = (timed: TimedLine[], s: { start: number; end: number }) => timed.filter((l) => l.start < s.end - 0.2 && l.end > s.start + 0.2).map((l) => l.text);

// Gives every shot its type. The full video aims for FULL_MIX by screen time: sung lines lean to
// singing, instrumental stretches to dancing, and the same type never runs three shots in a row.
export function assignShotTypes(kind: MusicVideoKind, cuts: { start: number; end: number }[], timed: TimedLine[]): PlannedShot[] {
  const withLines = cuts.map((c) => ({ ...c, lines: linesIn(timed, c) }));
  if (kind === "lyric") return withLines.map((s) => ({ ...s, type: "lyric" }));
  if (kind === "story") return withLines.map((s) => ({ ...s, type: "scene" }));
  if (kind === "performance") return withLines.map((s) => ({ ...s, type: s.lines.length ? "sing" : "scene" }));

  const total = cuts.reduce((a, c) => a + c.end - c.start, 0) || 1;
  const used = { sing: 0, dance: 0, scene: 0 };
  const out: PlannedShot[] = [];
  for (const s of withLines) {
    const len = s.end - s.start;
    const types = (["sing", "dance", "scene"] as const).filter((t) => {
      const n = out.length;
      return !(n >= 2 && out[n - 1].type === t && out[n - 2].type === t);
    });
    // How far each type is behind its share, nudged by what fits this stretch of the song.
    const want = (t: "sing" | "dance" | "scene") => {
      const behind = FULL_MIX[t] - (used[t] + len) / total;
      const fit = t === "sing" ? (s.lines.length ? 0.15 : -0.5) : t === "dance" ? (s.lines.length ? 0 : 0.2) : 0;
      // Open on the star singing when the song starts with words; otherwise a scene sets it up.
      const opener = out.length === 0 ? (t === "dance" ? -0.3 : 0) : 0;
      return behind + fit + opener;
    };
    const type = types.sort((a, b) => want(b) - want(a))[0];
    used[type] += len;
    out.push({ ...s, type });
  }
  return out;
}

export function planShots(kind: MusicVideoKind, durationSec: number, grid: BeatGrid, timed: TimedLine[]): PlannedShot[] {
  return assignShotTypes(kind, cutOnDownbeats(durationSec, grid, timed, SHOT_SECONDS[kind]), timed);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
