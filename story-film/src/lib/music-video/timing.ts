// Times lyric lines against a sung track, then cuts the song into scenes.

export interface Word {
  start: number;
  end: number;
}

export interface TimedLine {
  text: string;
  start: number;
  end: number;
}

export interface Scene {
  start: number;
  end: number;
  lines: string[];
}

// Lyric lines that are actually sung (section tags and blanks removed).
export function singableLines(lyrics: string): string[] {
  return lyrics
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^\[.*\]$/.test(l));
}

const MIN_GAP = 0.35;
const SNAP_WINDOW = 2.5;
const MIN_LINE = 1;
const MAX_LINE = 8;

// Spreads lines over the sung part of the song in proportion to their length,
// then snaps each line break to the nearest pause between sung words. Whisper's
// text for sung (often Hindi) audio is unreliable, but its word timings are good
// enough to find where the singing starts, stops and breathes.
export function timeLines(lines: string[], words: Word[], durationSec: number): TimedLine[] {
  if (!lines.length) return [];
  const sung = words.filter((w) => w.end > w.start).sort((a, b) => a.start - b.start);
  const useWords = sung.length >= 3;
  const regionStart = useWords ? sung[0].start : durationSec * 0.08;
  const regionEnd = useWords ? Math.min(sung[sung.length - 1].end, durationSec) : durationSec * 0.95;
  const span = Math.max(regionEnd - regionStart, lines.length * MIN_LINE);

  const pauses: number[] = [];
  for (let i = 1; i < sung.length; i++) if (sung[i].start - sung[i - 1].end >= MIN_GAP) pauses.push(sung[i].start);

  const weights = lines.map((l) => l.length + 4);
  const total = weights.reduce((a, b) => a + b, 0);
  const bounds = [regionStart];
  let acc = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    acc += weights[i];
    const ideal = regionStart + (span * acc) / total;
    const prev = bounds[bounds.length - 1];
    const near = pauses
      .filter((p) => Math.abs(p - ideal) <= SNAP_WINDOW && p >= prev + MIN_LINE)
      .sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))[0];
    bounds.push(Math.max(near ?? ideal, prev + MIN_LINE));
  }
  bounds.push(Math.max(regionEnd, bounds[bounds.length - 1] + MIN_LINE));

  return lines.map((text, i) => ({
    text,
    start: round(bounds[i]),
    // Don't leave a caption up through a long instrumental break.
    end: round(Math.min(bounds[i + 1], bounds[i] + MAX_LINE, durationSec)),
  }));
}

// Cuts the whole song (intro and outro included) into scenes between minSec and
// maxSec long, preferring to cut where a lyric line starts.
export function planScenes(timed: TimedLine[], durationSec: number, minSec: number, maxSec: number): Scene[] {
  const cuts = [...new Set(timed.map((l) => l.start).filter((t) => t > 0 && t < durationSec))].sort((a, b) => a - b);
  const scenes: Scene[] = [];
  let t = 0;
  while (durationSec - t > 0.05) {
    const remaining = durationSec - t;
    let end: number;
    if (remaining <= maxSec) end = durationSec;
    else {
      const options = cuts.filter((c) => c >= t + minSec && c <= t + maxSec);
      end = options.length ? options[options.length - 1] : t + maxSec;
      // Avoid leaving a sliver shorter than minSec at the end.
      if (durationSec - end < minSec && durationSec - t <= maxSec + minSec) end = t + (durationSec - t) / 2;
    }
    const lines = timed.filter((l) => l.start < end && l.end > t).map((l) => l.text);
    scenes.push({ start: round(t), end: round(end), lines });
    t = end;
  }
  return scenes;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
