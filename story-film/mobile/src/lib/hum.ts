import type { AudioPlayer } from "expo-audio";

import { ApiError, type Film, type Song } from "./api";
import { authClient } from "./auth-client";
import { API_URL } from "./config";

// "Hum it" (mirrors story-film/src/lib/voice-create/ and the /api/voice routes).
export type HeardKind = "hum" | "sing" | "speech";
export type MakeKind = "song" | "reel" | "music_video";

export interface Plan {
  make: MakeKind;
  topic: string;
  title: string;
  genre: string;
  mood: string;
  language: string;
  durationSec: number;
  lyrics: string;
}

export interface Take {
  takeId: string;
  durationSec: number;
  video: boolean;
  kind: HeardKind;
  transcript: string;
  plan: Plan;
  // What each choice costs: a song on your tune, a song from a request, a reel after the free ones.
  credits: { tune: number; song: number; reel: number };
  songsAvailable: boolean;
}

export interface TuneSong {
  kind: "hum" | "sing";
  title: string;
  genre: string;
  mood: string;
  language: string;
  topic: string;
  lyrics: string;
}

export interface Mix {
  takeId: string;
  songId?: string;
  startSec: number;
  endSec?: number;
  fadeInSec: number;
  fadeOutSec: number;
  voiceVolume: number;
  musicVolume: number;
}

export interface Picked {
  uri: string;
  name: string;
  type: string;
}

async function send<T>(path: string, init: RequestInit): Promise<T> {
  const cookie = await authClient.getCookie();
  const json = typeof init.body === "string";
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "omit",
    headers: { ...(json ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status, Boolean(body.needCredits));
  return body as T;
}

export const hum = {
  // Nothing is charged: the server works out what it heard and sends back a plan.
  upload: (file: Picked, opts: { transcript?: string; language?: string } = {}) => {
    const form = new FormData();
    // React Native's FormData takes { uri, name, type } for files.
    form.append("file", file as unknown as Blob);
    if (opts.transcript) form.append("transcript", opts.transcript);
    if (opts.language) form.append("language", opts.language);
    return send<Take>("/api/voice/takes", { method: "POST", body: form });
  },
  // A typed request, or one handed over by Siri or another app.
  understand: (text: string) => send<Omit<Take, "takeId" | "durationSec" | "video">>("/api/voice/understand", { method: "POST", body: JSON.stringify({ text }) }),
  tuneSong: (takeId: string, input: TuneSong) =>
    send<{ id: string; credits: number }>(`/api/voice/takes/${takeId}/song`, { method: "POST", body: JSON.stringify(input) }),
  mix: (input: Mix) => send<{ song?: Song; film?: Film }>("/api/voice/mix", { method: "POST", body: JSON.stringify(input) }),
};

// The take a screen hands to the next one (the confirm, making and mix screens share it).
let current: { take: Take; file: Picked } | null = null;
export const currentTake = {
  set: (take: Take, file: Picked) => {
    current = { take, file };
  },
  get: () => current,
  clear: () => {
    current = null;
  },
};

export const KIND_LABEL: Record<HeardKind, string> = { hum: "Humming", sing: "Singing", speech: "Asking" };

export const MAKE_OPTIONS: { value: MakeKind; label: string }[] = [
  { value: "song", label: "Song" },
  { value: "reel", label: "Reel" },
  { value: "music_video", label: "Music video" },
];

// The prompt from a deep link or Siri, trimmed to what the confirm card takes.
export function cleanPrompt(raw: unknown): string {
  const text = Array.isArray(raw) ? raw[0] : raw;
  return typeof text === "string" ? text.replace(/\s+/g, " ").trim().slice(0, 500) : "";
}

// Recorder metering is in dBFS (-160..0); bars read 0..1 from about -50 dB.
export function level(db: number | undefined): number {
  if (db === undefined || !Number.isFinite(db)) return 0;
  return Math.min(1, Math.max(0, (db + 50) / 50));
}

// expo-audio players take their volume as a property (set outside components, which may not mutate hook values).
export function setVolume(player: AudioPlayer, volume: number) {
  player.volume = volume;
}
