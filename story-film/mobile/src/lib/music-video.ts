// Music videos for a song: the four kinds with prices, a free storyboard to check, then the render.
// Mirrors src/app/api/songs/[id]/music-video on the server.
import type { Href } from "expo-router";

import { ApiError } from "./api";
import { authClient } from "./auth-client";
import { API_URL, DEMO } from "./config";

export type MusicVideoKind = "lyric" | "story" | "performance" | "full";
export type ShotType = "sing" | "dance" | "scene" | "lyric";

export interface KindOption {
  kind: MusicVideoKind;
  available: boolean;
  credits: number;
  creditsPer5s: number | null;
}

export interface MusicVideoOptions {
  durationSec: number;
  kinds: KindOption[];
  danceStyles: { id: string; label: string }[];
}

export interface StoryboardShot {
  start: number;
  end: number;
  type: ShotType;
  lines: string[];
  imagePrompt: string;
  frameUrl: string | null;
}

export interface Storyboard {
  kind: MusicVideoKind;
  duration: number;
  bpm: number;
  credits: number;
  star: { description: string; imageUrl: string | null } | null;
  shotTypes: ShotType[];
  redrawsLeft: number;
  shots: StoryboardShot[];
}

export interface MusicVideo {
  id: string;
  status: "queued" | "running" | "review" | "completed" | "failed";
  stage: string | null;
  error: string | null;
  videoUrl: string | null;
  storyboard: Storyboard | null;
}

export interface NewMusicVideo {
  kind: MusicVideoKind;
  style: "photoreal" | "cinematic" | "animated";
  danceStyle: string;
  range: { start: number; end: number };
  captions: boolean;
  kidSafe: boolean;
  photo?: string;
  photoConsent?: boolean;
  danceClip?: string;
  danceClipConsent?: boolean;
}

async function headers(): Promise<Record<string, string>> {
  const cookie = await authClient.getCookie();
  return cookie ? { Cookie: cookie } : {};
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "omit",
    headers: { "Content-Type": "application/json", ...(await headers()), ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status, Boolean(body.needCredits));
  return body as T;
}

// Where a film waiting in "review" is checked: a music video's storyboard, or an edit's effects.
export function reviewHref(f: { id: string; songId?: string | null }): Href {
  return f.songId ? `/songs/video/${f.songId}?film=${f.id}` : `/edit/${f.id}`;
}

const base = (songId: string) => `/api/songs/${songId}/music-video`;

const real = {
  options: (songId: string, seconds: number) => call<MusicVideoOptions>(`${base(songId)}?seconds=${Math.round(seconds)}`),
  start: (songId: string, input: NewMusicVideo) =>
    call<{ id: string; credits: number }>(base(songId), { method: "POST", body: JSON.stringify({ ...input, storyboard: true }) }),
  get: (songId: string, id: string) => call<MusicVideo>(`${base(songId)}/${id}`),
  change: (songId: string, id: string, shots: { type: ShotType; imagePrompt: string; redraw?: boolean }[]) =>
    call<{ storyboard: Storyboard; blocked: number }>(`${base(songId)}/${id}`, { method: "PUT", body: JSON.stringify({ shots }) }),
  render: (songId: string, id: string) => call<{ id: string; credits: number }>(`${base(songId)}/${id}`, { method: "POST" }),
  // A clip of the creator dancing; the full music video copies its moves. Needs their consent.
  uploadDanceClip: async (songId: string, clip: { uri: string; name: string; type: string }) => {
    const form = new FormData();
    form.append("clip", clip as unknown as Blob);
    form.append("consent", "true");
    const res = await fetch(`${API_URL}${base(songId)}/dance-clip`, { method: "POST", body: form, credentials: "omit", headers: await headers() });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(body.error ?? `Upload failed (${res.status})`, res.status);
    return (body as { danceClip: string }).danceClip;
  },
  uri: (path: string | null) => (path ? `${API_URL}${path}` : null),
  headers,
};

/* ---------- Demo mode: a sample storyboard so the screen can be tried without a backend ---------- */

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DEMO_PRICES: Record<MusicVideoKind, number | null> = { lyric: null, story: 34, performance: 36, full: 40 };
let demoVideo: MusicVideo | null = null;

const demo: typeof real = {
  options: async (_songId, seconds) => (
    await wait(200),
    {
      durationSec: 60,
      kinds: (Object.keys(DEMO_PRICES) as MusicVideoKind[]).map((kind) => ({
        kind,
        available: true,
        creditsPer5s: DEMO_PRICES[kind],
        credits: DEMO_PRICES[kind] === null ? 2 : Math.ceil(seconds / 5) * DEMO_PRICES[kind]!,
      })),
      danceStyles: [
        { id: "bollywood", label: "Bollywood" },
        { id: "bhangra", label: "Bhangra" },
        { id: "hiphop", label: "Hip-hop" },
        { id: "garba", label: "Garba" },
        { id: "kids", label: "Kids" },
      ],
    }
  ),
  start: async (_songId, input) => {
    await wait(400);
    const types: ShotType[] = input.kind === "full" ? ["sing", "dance", "scene", "sing"] : input.kind === "performance" ? ["sing", "sing", "scene"] : input.kind === "lyric" ? ["lyric", "lyric"] : ["scene", "scene"];
    const per = (input.range.end - input.range.start) / types.length;
    demoVideo = {
      id: "demo-mv",
      status: "review",
      stage: null,
      error: null,
      videoUrl: null,
      storyboard: {
        kind: input.kind,
        duration: input.range.end - input.range.start,
        bpm: 96,
        credits: DEMO_PRICES[input.kind] === null ? 2 : Math.ceil((input.range.end - input.range.start) / 5) * DEMO_PRICES[input.kind]!,
        star: input.kind === "lyric" ? null : { description: "a young singer in a mustard kurta", imageUrl: null },
        shotTypes: input.kind === "full" ? ["sing", "dance", "scene"] : input.kind === "performance" ? ["sing", "scene"] : [types[0]],
        redrawsLeft: 8,
        shots: types.map((type, i) => ({ start: i * per, end: (i + 1) * per, type, lines: i % 2 ? [] : ["Baarish ki boondon mein tera naam"], imagePrompt: "the star on a rainy Mumbai rooftop at dusk", frameUrl: null })),
      },
    };
    return { id: demoVideo.id, credits: demoVideo.storyboard!.credits };
  },
  get: async () => (await wait(200), demoVideo!),
  change: async (_songId, _id, shots) => {
    await wait(300);
    demoVideo!.storyboard!.shots = demoVideo!.storyboard!.shots.map((s, i) => ({ ...s, ...shots[i] }));
    return { storyboard: demoVideo!.storyboard!, blocked: 0 };
  },
  render: async () => {
    await wait(300);
    demoVideo = { ...demoVideo!, status: "failed", error: "Demo mode can't make videos" };
    return { id: demoVideo.id, credits: 0 };
  },
  uploadDanceClip: async () => (await wait(300), "00000000-0000-4000-8000-000000000000"),
  uri: () => null,
  headers: async () => ({}),
};

export const musicVideos = DEMO ? demo : real;
