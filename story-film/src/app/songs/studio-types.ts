// What the Studio screen reads from the songs API (mirrors songView and GET /api/songs).

export interface StudioSong {
  id: string;
  title: string;
  genre: string;
  lyrics: string;
  durationSec: number;
  status: string;
  error: string | null;
  audioUrl: string | null;
  contentCredentials: boolean;
}

// One kind of remix as the server lists it (src/lib/songs/remix.ts remixKindList).
export interface RemixKindInfo {
  kind: string;
  label: string;
  help: string;
  credits: number;
  style: "required" | "optional" | "none";
  part: boolean;
  extend: boolean;
  lyrics: boolean;
  bars: boolean;
  // Covers on Runware: how far from the original, 0 to 1. Older servers leave it out.
  strength?: boolean;
}

export interface SoundPresetInfo {
  id: string;
  label: string;
  help: string;
}

export interface StudioInfo {
  remixKinds: RemixKindInfo[];
  soundPresets: SoundPresetInfo[];
  stemsCredits: number;
  available: boolean;
}

// Play controls for the song itself, shared by the tabs so only one thing plays at a time.
export interface SongAudio {
  position: number;
  playing: boolean;
  toggle: () => void;
  seek: (sec: number) => void;
  // Plays [start, end] once, for hearing a picked part.
  playPart: (start: number, end: number) => void;
  pause: () => void;
}

export async function postJson<T>(url: string, body: unknown): Promise<{ ok: boolean; data: T & { error?: string; needCredits?: boolean } }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

export const fmtTime = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
