// The player's queue and Autoplay, as plain functions on plain data. This file is copied to
// mobile/src/lib/listen-queue.ts and must stay identical (tests/listen-queue.test.ts checks).
// Each track has a `key`: "s:<publicId>" for public songs, "own:<id>" for the listener's own.

export type QueueTrack = { key: string; auto?: boolean };

export type Queue<T extends QueueTrack> = {
  items: T[];
  // The one playing (or paused), or -1 when nothing is loaded.
  index: number;
  // Keys heard this session, so Autoplay doesn't repeat them.
  heard: string[];
  // Keys the listener removed from the queue: Autoplay leaves them out even when it starts repeating.
  skipped: string[];
};

export const emptyQueue = <T extends QueueTrack>(): Queue<T> => ({ items: [], index: -1, heard: [], skipped: [] });

const MAX_HEARD = 300;

function hear<T extends QueueTrack>(q: Queue<T>, key: string | undefined): string[] {
  if (!key || q.heard.includes(key)) return q.heard;
  return [...q.heard, key].slice(-MAX_HEARD);
}

export const current = <T extends QueueTrack>(q: Queue<T>): T | undefined => q.items[q.index];
export const upNext = <T extends QueueTrack>(q: Queue<T>): T[] => q.items.slice(q.index + 1);

// Tapping a song in a list plays it, and the rest of that list becomes the queue.
export function playList<T extends QueueTrack>(q: Queue<T>, list: T[], start: number): Queue<T> {
  const items = list.slice(start);
  return { items, index: items.length ? 0 : -1, heard: hear(q, items[0]?.key), skipped: q.skipped };
}

// One song on its own, keeping what was next.
export function playOne<T extends QueueTrack>(q: Queue<T>, track: T): Queue<T> {
  return { items: [track, ...upNext(q).filter((t) => t.key !== track.key)], index: 0, heard: hear(q, track.key), skipped: q.skipped };
}

export function playNext<T extends QueueTrack>(q: Queue<T>, track: T): Queue<T> {
  if (q.index < 0) return playOne(q, track);
  const rest = upNext(q).filter((t) => t.key !== track.key);
  return { ...q, items: [...q.items.slice(0, q.index + 1), { ...track, auto: false }, ...rest] };
}

export function addToQueue<T extends QueueTrack>(q: Queue<T>, track: T): Queue<T> {
  if (q.index < 0) return playOne(q, track);
  if (upNext(q).some((t) => t.key === track.key)) return q;
  // Songs you add go before Autoplay's picks.
  const next = upNext(q);
  const firstAuto = next.findIndex((t) => t.auto);
  const at = firstAuto === -1 ? q.items.length : q.index + 1 + firstAuto;
  return { ...q, items: [...q.items.slice(0, at), { ...track, auto: false }, ...q.items.slice(at)] };
}

// Moves on; returns the same queue when there's nothing next (the caller asks Autoplay first).
export function next<T extends QueueTrack>(q: Queue<T>): Queue<T> {
  if (q.index + 1 >= q.items.length) return q;
  const index = q.index + 1;
  return { ...q, index, heard: hear(q, q.items[index].key) };
}

// Back a song, or to the start of this one when it has played more than 3 seconds ("restart").
export function previous<T extends QueueTrack>(q: Queue<T>, positionSec: number): { queue: Queue<T>; restart: boolean } {
  if (positionSec > 3 || q.index <= 0) return { queue: q, restart: true };
  return { queue: { ...q, index: q.index - 1 }, restart: false };
}

export function skipTo<T extends QueueTrack>(q: Queue<T>, index: number): Queue<T> {
  if (index < 0 || index >= q.items.length) return q;
  return { ...q, index, heard: hear(q, q.items[index].key) };
}

// Removes an upcoming song (the one playing can't be removed; skip it instead). Autoplay won't
// bring it back this session.
export function remove<T extends QueueTrack>(q: Queue<T>, key: string): Queue<T> {
  const i = q.items.findIndex((t, n) => t.key === key && n > q.index);
  if (i === -1) return q;
  return { ...q, items: q.items.filter((_, n) => n !== i), heard: hear(q, key), skipped: [...q.skipped.filter((k) => k !== key), key].slice(-MAX_HEARD) };
}

// "Clear": everything after the current song goes; songs already played stay for Previous.
export function clear<T extends QueueTrack>(q: Queue<T>): Queue<T> {
  return { ...q, items: q.items.slice(0, q.index + 1) };
}

// Autoplay tops up when one song or fewer is left.
export function needsMore<T extends QueueTrack>(q: Queue<T>, autoplay: boolean): boolean {
  return autoplay && q.index >= 0 && upNext(q).length <= 1;
}

// Public ids Autoplay must skip: everything heard or already queued.
export function excludeIds<T extends QueueTrack>(q: Queue<T>): string[] {
  const keys = new Set([...q.heard, ...q.items.map((t) => t.key)]);
  return [...keys].filter((k) => k.startsWith("s:")).map((k) => k.slice(2));
}

// The seed for Autoplay: the last public song in the queue (the newest taste), else none.
export function seedId<T extends QueueTrack>(q: Queue<T>): string | undefined {
  const pub = [...q.items].reverse().find((t) => t.key.startsWith("s:"));
  return pub?.key.slice(2);
}

// When every song has been heard, Autoplay starts again rather than stopping: these are the
// public ids to skip then (what's playing or queued, the last two heard, and removed songs).
export function repeatExcludeIds<T extends QueueTrack>(q: Queue<T>): string[] {
  const keys = new Set([...q.items.slice(Math.max(0, q.index)).map((t) => t.key), ...q.heard.slice(-2), ...q.skipped]);
  return [...keys].filter((k) => k.startsWith("s:")).map((k) => k.slice(2));
}

// Adds Autoplay's picks at the end, marked so the queue sheet can show them apart. With `repeat`,
// songs heard earlier may come back (see repeatExcludeIds).
export function appendAuto<T extends QueueTrack>(q: Queue<T>, tracks: T[], repeat = false): Queue<T> {
  const have = new Set(repeat ? [...q.items.slice(Math.max(0, q.index)).map((t) => t.key), ...q.skipped] : [...q.items.map((t) => t.key), ...q.heard]);
  const fresh = tracks.filter((t) => !have.has(t.key)).map((t) => ({ ...t, auto: true }));
  return fresh.length ? { ...q, items: [...q.items, ...fresh] } : q;
}

// Autoplay switched off: its picks that haven't played yet leave the queue.
export function dropAuto<T extends QueueTrack>(q: Queue<T>): Queue<T> {
  return { ...q, items: q.items.filter((t, n) => n <= q.index || !t.auto) };
}
