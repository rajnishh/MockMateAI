import { authClient } from "./auth-client";
import type { Style } from "./styles";
import { API_URL, DEMO } from "./config";

// "review": an edit is planned and waits for the creator to check its effects.
export type FilmStatus = "queued" | "running" | "review" | "completed" | "failed";
export type Stage = "script" | "keyframes" | "clips" | "audio" | "assemble" | "done";

export interface Film {
  id: string;
  status: FilmStatus;
  stage: Stage | null;
  title: string | null;
  story: string;
  quality: Quality;
  credits: number;
  error: string | null;
  createdAt: string;
  videoUrl: string | null;
  // Set for music videos: their storyboard is checked on the song's music video screen.
  songId?: string | null;
  format?: "story" | "motion" | "dance" | "edit" | "music";
}

export type Currency = "INR" | "USD" | "AED";

export interface Offer {
  id: string;
  name: string;
  credits: number;
  price: Record<Currency, number>;
}

export interface Billing {
  packs: Offer[];
  plans: Offer[];
  balance: number;
  freeVideosPerWeek: number;
  premiumAvailable: boolean;
  premiumCreditsPerShot: number;
  // Hyper-real 1080p reels (Kling 3.0 or Veo 3.1); missing on older servers.
  cinematicAvailable?: boolean;
  cinematicCreditsPerShot?: number;
}

export interface Idea {
  title: string;
  // The first spoken line; missing when the AI's hook was weak.
  hook?: string;
  idea: string;
  format?: "story" | "motion" | "dance";
}

export interface PostCopy {
  title: string;
  caption: string;
  hashtags: string[];
}

export type Platform = "instagram" | "youtube" | "whatsapp";

export type SocialPlatform = "instagram" | "youtube";

export interface Account {
  id: string;
  platform: SocialPlatform;
  name: string;
  imageUrl: string | null;
  needsReconnect?: boolean;
}

export interface Accounts {
  instagramAvailable: boolean;
  youtubeAvailable: boolean;
  accounts: Account[];
}

export type PostStatus = "scheduled" | "publishing" | "published" | "failed" | "cancelled";

export interface Post {
  id: string;
  filmId: string;
  title: string;
  scheduledAt: string;
  status: PostStatus;
  externalUrl: string | null;
  error: string | null;
  accountName: string | null;
  platform: SocialPlatform | null;
}

export interface NewPost {
  filmId: string;
  socialAccountId: string;
  title: string;
  description: string;
  tags: string[];
  // Omit to post now.
  scheduledAt?: string;
}

// How the creator's own voice is processed: as recorded, cleaned and levelled, or a little deeper.
export type Voice = "natural" | "clear" | "deeper";

// Ask Reelkar, the built-in agent (mirrors story-film/src/lib/agent/cards.ts).
export type PostingMode = "ask" | "auto_schedule" | "auto_now";
export type AgentCard =
  | { type: "ideas"; ideas: { title: string; hook?: string; idea: string }[]; format: "story" | "motion" | "dance"; language?: string }
  | { type: "reel"; reelId: string; title: string; status: string; note?: string }
  | { type: "reels"; reels: { reelId: string; title: string; status: string; format: string }[] }
  | { type: "proposal"; actionId: string; text: string; status: "proposed" | "waiting" | "done" | "cancelled" | "failed" }
  | { type: "post"; text: string; status: "scheduled" | "waiting"; at: string | null; reelId: string }
  | { type: "caption"; reelId: string; platform: string; text: string }
  | { type: "connect"; text: string }
  | { type: "settings"; postingMode: PostingMode }
  | { type: "credits"; text: string }
  | { type: "error"; text: string };
export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  cards: AgentCard[];
  createdAt: string;
}
// Sent with each agent request: the device's time zone and the creator's saved preferences.
export interface AgentTurn {
  timeZone?: string;
  language?: string;
  topic?: string;
  brand?: { accent?: string; background?: "light" | "dark"; handle?: string };
}

// The edit plan for "Edit my video" (mirrors story-film/src/lib/edit/plan.ts).
export type Span = { start: number; end: number };
export type EditCard = (
  | { type: "point"; text: string; highlight?: string }
  | { type: "list"; heading: string; items: string[] }
  | { type: "stat"; value: number; prefix?: string; suffix?: string; label: string }
  | { type: "cta"; text: string; action?: string }
) &
  Span;
export type EffectType = "backdrop" | "spotlight" | "cutout" | "stamp" | "focus";
export type EditEffect = (
  | { type: "backdrop"; text: string }
  | { type: "spotlight" }
  | { type: "cutout" }
  | { type: "stamp"; text: string }
  | { type: "focus"; label?: string }
) &
  Span;
export interface EditPlan {
  title: string;
  zooms: Span[];
  cards: EditCard[];
  effects: EditEffect[];
}
export interface EditOptions {
  captions: boolean;
  sounds: boolean;
  voice: Voice;
}
// What the creator changed; words only when they fixed caption words.
export type EditChanges = { plan: EditPlan; words?: EditDraft["words"] } & EditOptions;

export interface EditDraft {
  status: FilmStatus;
  durationSec: number;
  plan: EditPlan;
  words: { word: string; start: number; end: number }[];
  options: EditOptions;
  // What the video analysis found: effects need a face, some also the person outline.
  available: { faces: boolean; mask: boolean };
  // null before the first render.
  rendersLeft: number | null;
  // A small copy of the clip in the final 9:16 crop, and the face position 10 times a second.
  previewUrl?: string | null;
  faces?: { rate: number; boxes: ([number, number, number, number] | null)[] } | null;
}

export interface EditUpload {
  // Local file picked from the gallery.
  video: { uri: string; name: string; type: string };
  language: string;
  captions: boolean;
  zooms: boolean;
  effects: boolean;
  sounds: boolean;
  voice: Voice;
  // Stop after planning so the creator can check each effect first.
  review: boolean;
  ending: "auto" | "none" | "follow" | "comment";
  keyword?: string;
  brand?: { accent?: string; background?: "light" | "dark"; handle?: string };
}

export type Quality = "standard" | "premium" | "cinematic";

export interface NewFilm {
  story: string;
  language: string;
  durationSec: number;
  quality: Quality;
  style: Style;
  // A photo from uploadPhoto: the reel's lead looks like this person. Needs photoConsent.
  photo?: string;
  photoConsent?: boolean;
  // "motion": animated text and graphics with a voice-over; "dance": cartoon kids dance to a
  // dhol beat with a chant. Both are drawn by Reelkar (no AI animation credits).
  format?: "story" | "motion" | "dance";
  // Motion and dance reels: how the reel ends (motion only), the comment keyword, and the brand look.
  ending?: "auto" | "none" | "follow" | "comment";
  keyword?: string;
  brand?: { accent?: string; background?: "light" | "dark"; handle?: string };
  kidSafe?: boolean;
}

// Song Studio (mirrors songView in story-film/src/lib/songs/songs.ts).
export type SongStatus = "queued" | "running" | "completed" | "failed";
export interface Song {
  id: string;
  title: string;
  genre: string;
  mood: string;
  language: string;
  lyrics: string;
  durationSec: number;
  status: SongStatus;
  myVoice: boolean;
  edited: boolean;
  contentCredentials: boolean;
  error: string | null;
  createdAt: string;
  audioUrl: string | null;
  // Square AI cover art, made just after the song; null until then.
  coverUrl?: string | null;
}
// The server lists its remix kinds (remixKinds), so kinds it adds later work without an app update.
export type RemixKind = "cover" | "extend" | "replace" | "rap" | (string & {});
export interface RemixKindInfo {
  kind: RemixKind;
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
export interface SoundPreset {
  id: string;
  label: string;
  help: string;
}
export type StemName = "vocals" | "drums" | "bass" | "other";
export interface SongStems {
  status: "none" | "running" | "ready" | "failed";
  error?: string;
  credits: number;
  stems: Record<StemName, string> | null;
}
export interface SongMix {
  gains?: Partial<Record<StemName, number>>;
  preset?: string;
}
// What the player draws from (mirrors story-film/src/lib/songs/analysis.ts).
export interface SongAnalysis {
  duration: number;
  envelope: number[];
  bpm: number;
  beats: number[];
  strength: number[];
  peaks: number[];
  lines: { text: string; start: number; end: number }[];
  timing: "words" | "even";
}
export interface SongStudio {
  songs: Song[];
  // What one Create costs, and each kind of remix.
  credits: number;
  remixCredits: Record<RemixKind, number>;
  // Missing on servers from before the Studio.
  remixKinds?: RemixKindInfo[];
  soundPresets?: SoundPreset[];
  stemsCredits?: number;
  available: boolean;
}
export type SongModel = "ace-step" | "lyria";
export type SongVocal = "auto" | "female" | "male" | "duet";
export interface SongOptions {
  topic: string;
  genre: string;
  mood: string;
  language: string;
  durationSec: 30 | 60 | 120;
  kidSafe: boolean;
}
// Simple: one sentence, AI writes the rest. Custom: every control. Instrumental: no vocals.
export type SongMode = "simple" | "custom" | "instrumental";
export interface NewSong extends SongOptions {
  mode?: SongMode;
  title: string;
  lyrics: string;
  style?: string;
  vocal: SongVocal;
  takes: 1 | 2;
  model: SongModel;
  // Simple mode: the structure blocks AI writes the lyrics in.
  structure?: string[];
  // 0-100 sliders: Experiment (safe to wild) and Follow my style (loose to strict).
  experiment?: number;
  strictness?: number;
  bpm?: number;
  keyScale?: string;
}
export interface SongEdit {
  startSec: number;
  endSec?: number;
  fadeInSec: number;
  fadeOutSec: number;
  speed: number;
}
export interface SongRemix {
  kind: RemixKind;
  style?: string;
  lyrics?: string;
  extendSec?: number;
  startSec?: number;
  endSec?: number;
  // "rap": the bars for the picked part.
  bars?: string;
  // Covers on Runware: 0 (close to the original) to 1 (far).
  strength?: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly needCredits = false,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  // The Better Auth Expo client keeps the session cookie; send it with every API call.
  const cookie = await authClient.getCookie();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "omit",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status, Boolean(body.needCredits));
  return body as T;
}

// The creator's AI engines (mirrors EnginesView in the web app's src/lib/agent/ai-choice.ts).
// Every AI task tries them top to bottom, then "Reelkar free", which is always last.
export interface AiProvider {
  id: string;
  name: string;
  price: string;
  keyUrl?: string;
  models: { id: string; label: string }[];
  anyModel: boolean;
  // Whether it can run Ask Reelkar's chat; all of them do the other AI tasks.
  chat: boolean;
  // A second value it needs besides the key, such as Cloudflare's account ID.
  extra?: { label: string; placeholder: string };
}
// "resting": its free allowance is used up until restUntil; "key": the key stopped working.
export type EngineStatus = "ready" | "resting" | "key";
export interface AiEngine {
  id: string;
  provider: string;
  name: string;
  model: string;
  keyHint: string | null;
  enabled: boolean;
  chat: boolean;
  status: EngineStatus;
  restUntil: number | null;
}
export interface AiEngines {
  engines: AiEngine[];
  providers: AiProvider[];
  ownKeys: boolean;
  reelkar: { status: EngineStatus; restUntil: number | null };
}
export interface NewAiEngine {
  provider: string;
  model?: string;
  key?: string;
  extra?: string;
}
export interface AiEngineChange {
  model?: string;
  key?: string;
  extra?: string;
  enabled?: boolean;
}
export const MAX_AI_ENGINES = 8;
export const aiNeedsKey = (id: string) => id !== "reelkar" && id !== "ollama";

const real = {
  films: async () => (await call<{ films: Film[] }>("/api/films")).films,
  film: (id: string) => call<Film>(`/api/films/${id}`),
  createFilm: (input: NewFilm) => call<{ id: string; credits: number }>("/api/films", { method: "POST", body: JSON.stringify(input) }),
  billing: () => call<Billing>("/api/billing"),
  ideas: async (niche: string, language: string, more: { format?: Idea["format"]; avoid?: string[] } = {}) =>
    (await call<{ ideas: Idea[] }>("/api/suggestions", { method: "POST", body: JSON.stringify({ niche, language, ...more }) })).ideas,
  caption: (id: string, platform: Platform) => call<PostCopy>(`/api/films/${id}/copy`, { method: "POST", body: JSON.stringify({ platform }) }),
  // "Edit my video": multipart upload; the server adds captions, zooms, cards, effects and sounds.
  uploadEdit: async (input: EditUpload) => {
    const form = new FormData();
    // React Native's FormData takes { uri, name, type } for files.
    form.append("video", input.video as unknown as Blob);
    form.append("language", input.language);
    form.append("captions", String(input.captions));
    form.append("zooms", String(input.zooms));
    form.append("effects", String(input.effects));
    form.append("sounds", String(input.sounds));
    form.append("voice", input.voice);
    form.append("review", String(input.review));
    form.append("ending", input.ending);
    if (input.keyword) form.append("keyword", input.keyword);
    if (input.brand) form.append("brand", JSON.stringify(input.brand));
    const cookie = await authClient.getCookie();
    const res = await fetch(`${API_URL}/api/edits`, { method: "POST", body: form, credentials: "omit", headers: cookie ? { Cookie: cookie } : {} });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(body.error ?? `Upload failed (${res.status})`, res.status, Boolean(body.needCredits));
    return body as { id: string; credits: number };
  },
  // A photo for an AI-animated or Cinematic reel; returns the id the reel request names.
  uploadPhoto: async (photo: { uri: string; name: string; type: string }) => {
    const form = new FormData();
    form.append("photo", photo as unknown as Blob);
    const cookie = await authClient.getCookie();
    const res = await fetch(`${API_URL}/api/photos`, { method: "POST", body: form, credentials: "omit", headers: cookie ? { Cookie: cookie } : {} });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(body.error ?? `Upload failed (${res.status})`, res.status);
    return (body as { photo: string }).photo;
  },
  editDraft: (id: string) => call<EditDraft>(`/api/edits/${id}`),
  previewUri: (draft: EditDraft) => (draft.previewUrl ? `${API_URL}${draft.previewUrl}` : null),
  // Saves the creator's changes and renders the video (again).
  saveEdit: (id: string, changes: EditChanges) =>
    call<{ id: string; rendersLeft: number }>(`/api/edits/${id}`, { method: "PUT", body: JSON.stringify(changes) }),
  agent: () => call<{ messages: AgentMessage[]; postingMode: PostingMode; freeLeft: number | null }>("/api/agent"),
  agentSend: async (text: string, turn: AgentTurn) => (await call<{ messages: AgentMessage[] }>("/api/agent", { method: "POST", body: JSON.stringify({ ...turn, text }) })).messages,
  // A card button: runs one action without the AI.
  agentAction: async (name: string, input: unknown, label: string, turn: AgentTurn) =>
    (await call<{ messages: AgentMessage[] }>("/api/agent/actions", { method: "POST", body: JSON.stringify({ ...turn, name, input, label }) })).messages,
  agentDecide: async (actionId: string, approve: boolean, turn: AgentTurn) =>
    (await call<{ messages: AgentMessage[] }>(`/api/agent/actions/${actionId}`, { method: "POST", body: JSON.stringify({ ...turn, approve }) })).messages,
  aiEngines: () => call<AiEngines>("/api/ai/engines"),
  // Adding, or changing the key, model or extra value, is checked with one tiny request on the server
  // first; a wrong key comes back as an error. Switching on or off isn't checked.
  addAiEngine: (engine: NewAiEngine) => call<AiEngines>("/api/ai/engines", { method: "POST", body: JSON.stringify(engine) }),
  changeAiEngine: (id: string, change: AiEngineChange) => call<AiEngines>(`/api/ai/engines/${id}`, { method: "PATCH", body: JSON.stringify(change) }),
  removeAiEngine: (id: string) => call<AiEngines>(`/api/ai/engines/${id}`, { method: "DELETE" }),
  // The full new order of the creator's engine ids.
  orderAiEngines: (ids: string[]) => call<AiEngines>("/api/ai/engines/order", { method: "PUT", body: JSON.stringify({ ids }) }),
  setPostingMode: (postingMode: PostingMode) => call<{ postingMode: PostingMode }>("/api/agent/settings", { method: "PUT", body: JSON.stringify({ postingMode }) }),
  accounts: () => call<Accounts>("/api/accounts"),
  // Returns the provider's sign-in page; the app opens it in the in-app browser.
  connectUrl: async (platform: SocialPlatform) => (await call<{ url: string }>(`/api/connect/${platform}`, { method: "POST" })).url,
  disconnect: (id: string) => call<unknown>(`/api/accounts/${id}`, { method: "DELETE" }),
  posts: async (from: Date, to: Date) =>
    (await call<{ posts: Post[] }>(`/api/posts?${new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })}`)).posts,
  createPost: async (input: NewPost) => (await call<{ post: Post }>("/api/posts", { method: "POST", body: JSON.stringify(input) })).post,
  cancelPost: (id: string) => call<unknown>(`/api/posts/${id}`, { method: "DELETE" }),
  retryPost: (id: string) => call<unknown>(`/api/posts/${id}/retry`, { method: "POST" }),
  deleteFilm: (id: string) => call<unknown>(`/api/films/${id}`, { method: "DELETE" }),
  // A signed link that plays without signing in (for 2 hours): used to save and share the video.
  // The server builds it on its public URL; the phone downloads through the address it already
  // reaches (a LAN IP or tunnel in development, where the public URL is often localhost).
  shareLink: async (id: string) => {
    const { url } = await call<{ url: string }>(`/api/films/${id}/link`, { method: "POST" });
    return `${API_URL}${new URL(url).pathname}`;
  },
  videoUrl: (film: Film) => (film.videoUrl ? `${API_URL}${film.videoUrl}` : null),
  songs: () => call<SongStudio>("/api/songs"),
  song: (id: string) => call<Song>(`/api/songs/${id}`),
  createSong: (input: NewSong) => call<{ id: string; ids: string[]; title?: string }>("/api/songs", { method: "POST", body: JSON.stringify(input) }),
  // "✨ Write a rap verse": rap bars for the song's [Rap] block.
  songRapVerse: async (input: SongOptions & { lyrics: string; bars?: 8 | 12 | 16 }) =>
    (await call<{ bars: string }>("/api/songs/lyrics/rap", { method: "POST", body: JSON.stringify(input) })).bars,
  // "✨ Write lyrics with AI" from the topic, or "✨ Enhance my lyrics" with the creator's own lines as the draft.
  songLyrics: (input: SongOptions & { draft?: string; structure?: string[]; duet?: boolean }) => call<{ title: string; lyrics: string }>("/api/songs/lyrics", { method: "POST", body: JSON.stringify(input) }),
  songStyle: async (input: Partial<SongOptions> & { genre: string; idea: string; vocal?: SongVocal }) =>
    (await call<{ style: string }>("/api/songs/style", { method: "POST", body: JSON.stringify(input) })).style,
  editSong: (id: string, edit: SongEdit) => call<Song>(`/api/songs/${id}/edit`, { method: "POST", body: JSON.stringify(edit) }),
  remixSong: (id: string, remix: SongRemix) => call<{ id: string }>(`/api/songs/${id}/remix`, { method: "POST", body: JSON.stringify(remix) }),
  songAudioUrl: (song: Song) => (song.audioUrl ? `${API_URL}${song.audioUrl}` : null),
  songCoverUrl: (song: Song) => (song.coverUrl ? `${API_URL}${song.coverUrl}` : null),
  // Studio: waveform, stems, mixes, sound previews and rap bars.
  songPeaks: async (id: string) => (await call<{ peaks: number[] }>(`/api/songs/${id}/peaks`)).peaks,
  songStems: (id: string) => call<SongStems>(`/api/songs/${id}/stems`),
  splitSong: (id: string) => call<SongStems>(`/api/songs/${id}/stems`, { method: "POST", body: "{}" }),
  saveMix: (id: string, mix: SongMix) => call<{ id: string }>(`/api/songs/${id}/mix`, { method: "POST", body: JSON.stringify(mix) }),
  songRap: async (id: string, input: { startSec: number; endSec: number; idea?: string }) =>
    (await call<{ bars: string }>(`/api/songs/${id}/rap`, { method: "POST", body: JSON.stringify(input) })).bars,
  stemUrl: (path: string) => `${API_URL}${path}`,
  soundPreviewUrl: (id: string, preset: string): string | null => `${API_URL}/api/songs/${id}/mix/preview?preset=${encodeURIComponent(preset)}`,
  songAnalysis: (id: string) => call<SongAnalysis>(`/api/songs/${id}/analysis`),
  videoHeaders: async (): Promise<Record<string, string>> => {
    const cookie = await authClient.getCookie();
    return cookie ? { Cookie: cookie } : {};
  },
};

/* ---------- Demo mode: sample data so the app can be tried without a backend ---------- */

const STAGES: Stage[] = ["script", "keyframes", "clips", "audio", "assemble", "done"];
const demoFilms: Film[] = [
  sample("d1", "Mia and the rain", "completed", 2),
  sample("d2", "3 chai hacks nobody told you", "completed", 1),
  sample("d3", "Monsoon recipe in 10 minutes", "completed", 3),
  { ...sample("d4", "Baarish dance: chham chham chham", "completed", 4), format: "dance" },
];
let demoBalance = 20;
const demoAccounts: Account[] = [];
const at = (days: number, h: number, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const demoPosts: Post[] = [
  { id: "p1", filmId: "d1", title: "Mia and the rain", scheduledAt: at(-1, 19, 30), status: "published", externalUrl: "https://www.instagram.com/", error: null, accountName: "@priyacooks", platform: "instagram" },
  { id: "p2", filmId: "d2", title: "3 chai hacks nobody told you", scheduledAt: at(0, 19, 30), status: "scheduled", externalUrl: null, error: null, accountName: "@priyacooks", platform: "instagram" },
  { id: "p3", filmId: "d3", title: "Monsoon recipe in 10 minutes", scheduledAt: at(1, 13), status: "scheduled", externalUrl: null, error: null, accountName: "Priya Cooks", platform: "youtube" },
];

// A steady 96 BPM pulse with the lyric lines spread evenly, so the player can be tried offline.
function demoAnalysis(song: Song | undefined): SongAnalysis {
  const duration = song?.durationSec ?? 60;
  const beats = Array.from({ length: Math.floor((duration * 96) / 60) }, (_, i) => Math.round(((i * 60) / 96 + 0.2) * 100) / 100);
  const lines = (song?.lyrics ?? "").split("\n").map((l) => l.trim()).filter((l) => l && !/^\[.*\]$/.test(l));
  const span = (duration * 0.85) / Math.max(1, lines.length);
  return {
    duration,
    envelope: Array.from({ length: duration * 20 }, (_, i) => Math.round((0.55 + 0.35 * Math.sin(i / 37) * Math.sin(i / 11)) * 100) / 100),
    bpm: 96,
    beats,
    strength: beats.map((_, i) => (i % 4 === 0 ? 1 : 0.6)),
    peaks: Array.from({ length: 160 }, (_, i) => Math.round((0.35 + 0.6 * Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.11))) * 100) / 100),
    lines: lines.map((text, i) => ({ text, start: duration * 0.08 + i * span, end: duration * 0.08 + (i + 1) * span })),
    timing: "even",
  };
}

const demoSongs: Song[] = [demoSong("s1", "Baarish wali chai", "indie-acoustic"), demoSong("s2", "Dadi ki rasoi", "bollywood-romantic")];
function demoSong(id: string, title: string, genre: string): Song {
  return {
    id,
    title,
    genre,
    mood: "happy",
    language: "hi",
    lyrics: "[Verse]\nBaarish ki boondein, khidki pe gaana\n\n[Chorus]\nYe pal hai mera",
    durationSec: 60,
    status: "completed",
    myVoice: false,
    edited: false,
    contentCredentials: true,
    error: null,
    createdAt: new Date().toISOString(),
    audioUrl: `/api/songs/${id}/audio`,
  };
}

function sample(id: string, title: string, status: FilmStatus, daysAgo: number): Film {
  return {
    id,
    status,
    stage: status === "completed" ? "done" : "script",
    title,
    story: title,
    quality: "standard",
    credits: 0,
    error: null,
    createdAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    videoUrl: null,
  };
}

const demoWords = "today I will show you three money mistakes everyone makes and the one habit that fixed mine".split(" ");
function demoDraft(): EditDraft {
  return {
    status: "review",
    durationSec: 12,
    plan: {
      title: "3 money mistakes",
      zooms: [{ start: 1.4, end: 2.4 }, { start: 8, end: 9.2 }],
      cards: [{ type: "list", heading: "Money mistakes", items: ["No budget", "Late bills", "No savings"], start: 3, end: 6.5 }],
      effects: [
        { type: "backdrop", text: "MONEY", start: 0.4, end: 2 },
        { type: "stamp", text: "MYTH", start: 7, end: 8 },
        { type: "spotlight", start: 9.6, end: 11.4 },
      ],
    },
    words: demoWords.map((word, i) => ({ word, start: 0.3 + i * 0.6, end: 0.3 + i * 0.6 + 0.5 })),
    options: { captions: true, sounds: true, voice: "natural" },
    available: { faces: true, mask: true },
    rendersLeft: 5,
    previewUrl: null,
    faces: { rate: 10, boxes: Array.from({ length: 120 }, (_, i) => [0.36 + 0.02 * Math.sin(i / 10), 0.24, 0.28, 0.16] as [number, number, number, number]) },
  };
}
const demoDrafts = new Map<string, EditDraft>();

// Demo agent: a few scripted answers so the screen can be tried without a server.
const demoChat: AgentMessage[] = [];
let demoMode: PostingMode = "ask";
const demoProposals = new Map<string, { reelId: string; text: string; status: "proposed" | "waiting" | "done" | "cancelled" | "failed" }>();
function demoSay(role: "user" | "assistant", text: string, cards: AgentCard[] = []) {
  demoChat.push({ id: `m${demoChat.length}`, role, text, cards, createdAt: new Date().toISOString() });
}
function demoReel(title: string, format: Film["format"] = "motion"): AgentCard {
  const f: Film = { ...sample(`d${Date.now()}${demoFilms.length}`, title, "queued", 0), format };
  demoFilms.push(f);
  return { type: "reel", reelId: f.id, title, status: "queued" };
}
function demoPost(reelId: string, title: string): AgentCard {
  const text = `Post “${title}” to Instagram tomorrow, 7:30 pm`;
  if (demoMode !== "ask") return { type: "post", reelId, status: "waiting", at: null, text: `Will post “${title}” when it's ready` };
  const actionId = `a${demoProposals.size + 1}`;
  demoProposals.set(actionId, { reelId, text, status: "proposed" });
  return { type: "proposal", actionId, text, status: "proposed" };
}
function demoHistory(): AgentMessage[] {
  return demoChat.map((m) => ({
    ...m,
    cards: m.cards.map((c) =>
      c.type === "reel" ? { ...c, status: demoFilms.find((f) => f.id === c.reelId)?.status ?? c.status } : c.type === "proposal" ? { ...c, status: demoProposals.get(c.actionId)?.status ?? c.status } : c,
    ),
  }));
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let demoEngines: AiEngine[] = [];
let demoEngineSeq = 0;
const DEMO_AI_PROVIDERS: AiProvider[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    price: "Free key, within Google's daily limits",
    keyUrl: "https://aistudio.google.com/apikey",
    models: [{ id: "gemini-3.5-flash", label: "Gemini 3.5 Flash · fast, free" }],
    anyModel: false,
    chat: true,
  },
  {
    id: "cloudflare",
    name: "Cloudflare Workers AI",
    price: "Your own free Cloudflare account, 10,000 neurons a day",
    keyUrl: "https://dash.cloudflare.com/profile/api-tokens",
    models: [{ id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", label: "Llama 3.3 70B · free" }],
    anyModel: true,
    chat: false,
    extra: { label: "Account ID", placeholder: "From the Workers AI page of your dashboard" },
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    price: "One key for hundreds of models",
    keyUrl: "https://openrouter.ai/keys",
    models: [{ id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B · free" }],
    anyModel: true,
    chat: true,
  },
];
const demoEnginesView = (): AiEngines => ({ engines: demoEngines.map((e) => ({ ...e })), providers: DEMO_AI_PROVIDERS, ownKeys: true, reelkar: { status: "ready", restUntil: null } });
const demoKeyHint = (key?: string) => (key && key.length >= 4 ? `…${key.slice(-4)}` : "…demo");

const demo: typeof real = {
  films: async () => (await wait(300), [...demoFilms].sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
  film: async (id) => {
    await wait(200);
    const f = demoFilms.find((x) => x.id === id);
    if (!f) throw new ApiError("Reel not found", 404);
    // Each poll moves a demo reel one stage forward.
    if (f.status === "queued" || f.status === "running") {
      const next = STAGES[Math.min(STAGES.indexOf(f.stage ?? "script") + 1, STAGES.length - 1)];
      f.stage = next;
      f.status = next === "done" ? "completed" : "running";
    }
    return { ...f };
  },
  createFilm: async (input) => {
    await wait(400);
    const drawn = input.format === "motion" || input.format === "dance";
    const perShot = input.quality === "cinematic" ? 30 : input.quality === "premium" ? 12 : 0;
    const cost = drawn ? 0 : Math.round(input.durationSec / 5) * perShot;
    if (cost > demoBalance) throw new ApiError(`${input.quality === "cinematic" ? "A Cinematic video" : "AI animation"} needs ${cost} credits for this length.`, 402, true);
    demoBalance -= cost;
    const f: Film = { ...sample(`d${Date.now()}`, input.story.slice(0, 40), "queued", 0), quality: drawn ? "standard" : input.quality, credits: cost, story: input.story, format: input.format ?? "story" };
    demoFilms.push(f);
    return { id: f.id, credits: cost };
  },
  billing: async () => (
    await wait(200),
    {
      balance: demoBalance,
      freeVideosPerWeek: 3,
      premiumAvailable: true,
      premiumCreditsPerShot: 12,
      cinematicAvailable: true,
      cinematicCreditsPerShot: 30,
      // Mirrors story-film/src/lib/billing/catalog.ts.
      packs: [
        { id: "starter", name: "Starter", credits: 50, price: { INR: 24900, USD: 399, AED: 1500 } },
        { id: "creator", name: "Creator", credits: 150, price: { INR: 64900, USD: 999, AED: 3700 } },
        { id: "pro", name: "Pro", credits: 400, price: { INR: 149900, USD: 2499, AED: 9200 } },
      ],
      plans: [
        { id: "creator_monthly", name: "Creator monthly", credits: 120, price: { INR: 49900, USD: 799, AED: 2900 } },
        { id: "pro_monthly", name: "Pro monthly", credits: 350, price: { INR: 129900, USD: 1999, AED: 7500 } },
      ],
    }
  ),
  ideas: async (niche) => {
    await wait(500);
    const n = niche || "your topic";
    return [
      { title: "3 hacks nobody told you", idea: `Three quick, surprising tips about ${n}, one per scene, ending with "Which one will you try?"` },
      { title: "5-minute version", idea: `Show the fastest way to do something people love in ${n}, with a countdown on screen.` },
      { title: "Mom vs me", idea: `A friendly face-off: the traditional way vs the shortcut, in ${n}. Viewers vote in the comments.` },
    ];
  },
  caption: async (id, platform) => {
    await wait(400);
    const f = demoFilms.find((x) => x.id === id);
    const title = f?.title ?? "My reel";
    const tags = platform === "whatsapp" ? [] : ["#reels", "#hindistory", "#madewithai"];
    return { title, caption: `${title} 🎬 Save this for later! · Made with AI`, hashtags: tags };
  },
  uploadPhoto: async () => (await wait(500), "00000000-0000-4000-8000-000000000000.jpg"),
  uploadEdit: async (input) => {
    await wait(800);
    const status = input.review ? "review" : "queued";
    const f: Film = { ...sample(`d${Date.now()}`, input.video.name.replace(/\.[a-z0-9]+$/i, ""), status, 0), story: `Edit of ${input.video.name}`, format: "edit" };
    demoFilms.push(f);
    demoDrafts.set(f.id, { ...demoDraft(), options: { captions: input.captions, sounds: input.sounds, voice: input.voice } });
    return { id: f.id, credits: 0 };
  },
  editDraft: async (id) => {
    await wait(300);
    const f = demoFilms.find((x) => x.id === id);
    if (!f) throw new ApiError("Reel not found", 404);
    if (!demoDrafts.has(id)) demoDrafts.set(id, demoDraft());
    const d = demoDrafts.get(id)!;
    return { ...d, status: f.status, rendersLeft: f.status === "review" ? null : d.rendersLeft };
  },
  saveEdit: async (id, changes) => {
    await wait(400);
    const f = demoFilms.find((x) => x.id === id);
    const d = demoDrafts.get(id);
    if (!f || !d) throw new ApiError("Reel not found", 404);
    const rerender = f.status === "completed";
    if (rerender && d.rendersLeft === 0) throw new ApiError("You've re-rendered this video 5 times.", 402);
    const { plan, words, ...options } = changes;
    demoDrafts.set(id, { ...d, plan, options, words: words ?? d.words, rendersLeft: rerender ? (d.rendersLeft ?? 5) - 1 : 5 });
    Object.assign(f, { status: "queued", stage: "assemble", title: plan.title });
    return { id, rendersLeft: rerender ? (d.rendersLeft ?? 5) - 1 : 5 };
  },
  agent: async () => (await wait(200), { messages: demoHistory(), postingMode: demoMode, freeLeft: 3 }),
  agentSend: async (text) => {
    await wait(700);
    demoSay("user", text);
    const t = text.toLowerCase();
    if (/dance|naach|नाच/.test(t)) {
      demoSay("assistant", "Bachchon ke liye dance ideas, “Make this dance” dabao.", [
        {
          type: "ideas",
          format: "dance",
          ideas: [
            { title: "Baarish dance", idea: "Kids splash and spin in the monsoon rain, chanting chham chham chham." },
            { title: "Count to five", idea: "Clap and jump while counting ek, do, teen, char, paanch." },
            { title: "Brush brush brush", idea: "A morning dance about brushing teeth, with a bouncy chant." },
          ],
        },
      ]);
    } else if (/idea|vichar|सुझाव/.test(t)) {
      demoSay("assistant", "Ye rahe kuch ideas, jo pasand aaye us par “Make this” dabao.", [
        {
          type: "ideas",
          format: "motion",
          ideas: [
            { title: "3 chai hacks", idea: "Three quick tricks for dhaba-style chai at home." },
            { title: "Chai vs coffee", idea: "Which one is better for your mornings, with three simple facts." },
            { title: "Masala chai in 5 min", idea: "A five-minute masala chai with a countdown on screen." },
          ],
        },
      ]);
    } else if (/week|hafte|हफ्ते/.test(t)) {
      const cards: AgentCard[] = [];
      for (const title of ["Chai hack 1", "Chai hack 2", "Chai hack 3"]) {
        const reel = demoReel(title) as Extract<AgentCard, { type: "reel" }>;
        cards.push(reel, demoPost(reel.reelId, title));
      }
      demoSay("assistant", "Is hafte ke 3 reels bana rahi hoon, roz shaam 7:30 baje ke liye.", cards);
    } else if (/reel|banao|make|बनाओ/.test(t)) {
      const reel = demoReel("3 chai hacks") as Extract<AgentCard, { type: "reel" }>;
      demoSay("assistant", "Reel bana rahi hoon. Post karne se pehle aapse puchungi.", [reel, demoPost(reel.reelId, "3 chai hacks")]);
    } else {
      demoSay("assistant", "Main reels bana sakti hoon, ideas de sakti hoon aur post schedule kar sakti hoon. Kya banana hai?");
    }
    return demoHistory();
  },
  agentAction: async (name, input, label) => {
    await wait(500);
    demoSay("user", label);
    if (name === "make_reel") {
      const { title = "New reel", format } = input as { title?: string; format?: Film["format"] };
      demoSay("assistant", "", [demoReel(title, format)]);
    }
    return demoHistory();
  },
  agentDecide: async (actionId, approve) => {
    await wait(300);
    const p = demoProposals.get(actionId);
    if (p && p.status === "proposed") {
      p.status = approve ? "done" : "cancelled";
      demoSay("assistant", approve ? "" : "Okay, I won't post it.", approve ? [{ type: "post", reelId: p.reelId, status: "scheduled", at: null, text: p.text.replace(/^Post/, "Scheduled") }] : []);
    }
    return demoHistory();
  },
  aiEngines: async () => (await wait(200), demoEnginesView()),
  addAiEngine: async ({ provider, model, key, extra }) => {
    await wait(900);
    const p = DEMO_AI_PROVIDERS.find((x) => x.id === provider);
    if (!p) throw new ApiError("Pick an AI to connect.", 400);
    if (demoEngines.length >= MAX_AI_ENGINES) throw new ApiError(`You can connect up to ${MAX_AI_ENGINES} engines.`, 400);
    if (aiNeedsKey(provider) && !key) throw new ApiError(`Add your ${p.name} key.`, 400);
    if (p.extra && !extra) throw new ApiError(`Add your ${p.extra.label}.`, 400);
    demoEngines.push({
      id: `demo-engine-${++demoEngineSeq}`,
      provider,
      name: p.name,
      model: model || p.models[0]?.id || "",
      keyHint: aiNeedsKey(provider) ? demoKeyHint(key) : null,
      enabled: true,
      chat: p.chat,
      status: "ready",
      restUntil: null,
    });
    return demoEnginesView();
  },
  changeAiEngine: async (id, change) => {
    await wait(change.enabled === undefined ? 900 : 200);
    demoEngines = demoEngines.map((e) =>
      e.id === id
        ? { ...e, model: change.model || e.model, keyHint: change.key ? demoKeyHint(change.key) : e.keyHint, enabled: change.enabled ?? e.enabled, status: change.key ? "ready" : e.status }
        : e,
    );
    return demoEnginesView();
  },
  removeAiEngine: async (id) => {
    await wait(200);
    demoEngines = demoEngines.filter((e) => e.id !== id);
    return demoEnginesView();
  },
  orderAiEngines: async (ids) => {
    await wait(200);
    demoEngines = ids.map((id) => demoEngines.find((e) => e.id === id)).filter((e): e is AiEngine => !!e);
    return demoEnginesView();
  },
  setPostingMode: async (postingMode) => {
    await wait(200);
    demoMode = postingMode;
    return { postingMode };
  },
  accounts: async () => (await wait(200), { instagramAvailable: true, youtubeAvailable: true, accounts: [...demoAccounts] }),
  connectUrl: async (platform) => {
    await wait(300);
    // Demo: pretend the person finished the provider's sign-in.
    if (!demoAccounts.some((a) => a.platform === platform))
      demoAccounts.push({ id: `a-${platform}`, platform, name: platform === "instagram" ? "@priyacooks" : "Priya Cooks", imageUrl: null });
    return "";
  },
  disconnect: async (id) => {
    const i = demoAccounts.findIndex((a) => a.id === id);
    if (i >= 0) demoAccounts.splice(i, 1);
    return {};
  },
  posts: async (from, to) =>
    (await wait(200), demoPosts.filter((p) => p.status !== "cancelled" && new Date(p.scheduledAt) >= from && new Date(p.scheduledAt) < to)),
  createPost: async (input) => {
    await wait(300);
    const account = demoAccounts.find((a) => a.id === input.socialAccountId);
    const now = !input.scheduledAt;
    const post: Post = {
      id: `p${Date.now()}${demoPosts.length}`,
      filmId: input.filmId,
      title: input.title,
      scheduledAt: input.scheduledAt ?? new Date().toISOString(),
      status: now ? "published" : "scheduled",
      externalUrl: now ? "https://www.instagram.com/" : null,
      error: null,
      accountName: account?.name ?? null,
      platform: account?.platform ?? null,
    };
    demoPosts.push(post);
    return post;
  },
  cancelPost: async (id) => {
    const p = demoPosts.find((x) => x.id === id);
    if (p) p.status = "cancelled";
    return {};
  },
  retryPost: async (id) => {
    const p = demoPosts.find((x) => x.id === id);
    if (p) Object.assign(p, { status: "scheduled", error: null, scheduledAt: new Date().toISOString() });
    return {};
  },
  deleteFilm: async (id) => {
    const i = demoFilms.findIndex((f) => f.id === id);
    if (i >= 0) demoFilms.splice(i, 1);
    return {};
  },
  shareLink: async () => {
    throw new ApiError("Saving and sharing need the Reelkar server, not the demo", 503);
  },
  songs: async () => (await wait(300), { songs: [...demoSongs], credits: 4, remixCredits: { cover: 2, extend: 2, replace: 1, rap: 1 }, available: true }),
  song: async (id) => {
    await wait(200);
    const s = demoSongs.find((x) => x.id === id);
    if (!s) throw new ApiError("Song not found", 404);
    return s;
  },
  createSong: async (input) => {
    await wait(500);
    if (demoBalance < 4) throw new ApiError("A song costs 4 credits.", 402, true);
    demoBalance -= 4;
    const ids = Array.from({ length: input.takes }, (_, i) => `s${Date.now()}${i}`);
    ids.forEach((id, i) => demoSongs.unshift({ ...demoSong(id, input.takes > 1 ? `${input.title} (v${i + 1})` : input.title, input.genre), status: "queued", audioUrl: null, lyrics: input.lyrics }));
    return { id: ids[0], ids };
  },
  songLyrics: async (input) => (
    await wait(600),
    { title: input.topic ? input.topic.slice(0, 40) : "Meri kahani", lyrics: `${input.draft ? `${input.draft}\n\n` : ""}[Verse]\nBaarish ki boondein, khidki pe gaana\nChai ki pyaali, maa ka bulaana\n\n[Chorus]\nYe pal hai mera, ye ghar hai mera\nHar subah naya, har din sunehra` }
  ),
  songStyle: async (input) => (await wait(400), `${input.idea || "soft"}, acoustic guitar, tabla, warm female vocals, mid tempo`),
  songRapVerse: async () => (await wait(600), "Subah ki chai, haath mein phone\nSapne bade, raaste anjaan, chal akela hi zone\nGalli se studio tak, beat pe mera naam\nMehnat ki syahi se likhta apna kaam"),
  editSong: async (id) => {
    await wait(400);
    const s = demoSongs.find((x) => x.id === id)!;
    const copy = { ...s, id: `s${Date.now()}`, title: `${s.title} (edit)`, edited: true };
    demoSongs.unshift(copy);
    return copy;
  },
  remixSong: async (id, remix) => {
    await wait(400);
    const s = demoSongs.find((x) => x.id === id)!;
    const copy = { ...s, id: `s${Date.now()}`, title: `${s.title} (${remix.kind})`, status: "queued" as const, audioUrl: null };
    demoSongs.unshift(copy);
    return { id: copy.id };
  },
  songAudioUrl: () => null,
  songPeaks: async () => (await wait(200), Array.from({ length: 160 }, (_, i) => 0.35 + 0.3 * Math.abs(Math.sin(i / 5)) + 0.2 * Math.abs(Math.sin(i * 1.7)))),
  songStems: async () => (await wait(200), { status: "none" as const, credits: 1, stems: null }),
  splitSong: async () => {
    throw new ApiError("Splitting songs needs the Reelkar server, not the demo", 503);
  },
  saveMix: async (id, mix) => {
    await wait(400);
    const s = demoSongs.find((x) => x.id === id)!;
    const copy = { ...s, id: `s${Date.now()}`, title: `${s.title} (${mix.gains ? "mix" : "sound"})`, status: "queued" as const, audioUrl: null };
    demoSongs.unshift(copy);
    return { id: copy.id };
  },
  songRap: async () => (await wait(600), "Subah ki chai, haath mein phone\nSapne bade, raaste anjaan, chalna hai alone\nGully se uthke, mic pe hai naam\nMehnat ki beat pe likhunga apna kaam"),
  stemUrl: () => "",
  soundPreviewUrl: () => null,
  songAnalysis: async (id) => demoAnalysis(demoSongs.find((s) => s.id === id)),
  videoUrl: () => null,
  previewUri: () => null,
  videoHeaders: async () => ({}),
  songCoverUrl: () => null,
};

export const api = DEMO ? demo : real;
