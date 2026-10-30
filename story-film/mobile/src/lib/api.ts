import { authClient } from "./auth-client";
import type { Style } from "./styles";
import { API_URL, DEMO } from "./config";

export type FilmStatus = "queued" | "running" | "completed" | "failed";
export type Stage = "script" | "keyframes" | "clips" | "audio" | "assemble" | "done";

export interface Film {
  id: string;
  status: FilmStatus;
  stage: Stage | null;
  title: string | null;
  story: string;
  quality: "standard" | "premium";
  credits: number;
  error: string | null;
  createdAt: string;
  videoUrl: string | null;
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
}

export interface Idea {
  title: string;
  idea: string;
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

export interface EditUpload {
  // Local file picked from the gallery.
  video: { uri: string; name: string; type: string };
  language: string;
  captions: boolean;
  zooms: boolean;
  effects: boolean;
  sounds: boolean;
  voice: Voice;
  ending: "auto" | "none" | "follow" | "comment";
  keyword?: string;
  brand?: { accent?: string; background?: "light" | "dark"; handle?: string };
}

export interface NewFilm {
  story: string;
  language: string;
  durationSec: number;
  quality: "standard" | "premium";
  style: Style;
  // "motion": animated text and graphics with a voice-over (no AI animation credits).
  format?: "story" | "motion";
  // Motion reels: how the reel ends, the comment keyword, and the creator's brand look.
  ending?: "auto" | "none" | "follow" | "comment";
  keyword?: string;
  brand?: { accent?: string; background?: "light" | "dark"; handle?: string };
  kidSafe?: boolean;
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

const real = {
  films: async () => (await call<{ films: Film[] }>("/api/films")).films,
  film: (id: string) => call<Film>(`/api/films/${id}`),
  createFilm: (input: NewFilm) => call<{ id: string; credits: number }>("/api/films", { method: "POST", body: JSON.stringify(input) }),
  billing: () => call<Billing>("/api/billing"),
  ideas: async (niche: string, language: string) =>
    (await call<{ ideas: Idea[] }>("/api/suggestions", { method: "POST", body: JSON.stringify({ niche, language }) })).ideas,
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
    form.append("ending", input.ending);
    if (input.keyword) form.append("keyword", input.keyword);
    if (input.brand) form.append("brand", JSON.stringify(input.brand));
    const cookie = await authClient.getCookie();
    const res = await fetch(`${API_URL}/api/edits`, { method: "POST", body: form, credentials: "omit", headers: cookie ? { Cookie: cookie } : {} });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(body.error ?? `Upload failed (${res.status})`, res.status, Boolean(body.needCredits));
    return body as { id: string; credits: number };
  },
  accounts: () => call<Accounts>("/api/accounts"),
  // Returns the provider's sign-in page; the app opens it in the in-app browser.
  connectUrl: async (platform: SocialPlatform) => (await call<{ url: string }>(`/api/connect/${platform}`, { method: "POST" })).url,
  disconnect: (id: string) => call<unknown>(`/api/accounts/${id}`, { method: "DELETE" }),
  posts: async (from: Date, to: Date) =>
    (await call<{ posts: Post[] }>(`/api/posts?${new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })}`)).posts,
  createPost: async (input: NewPost) => (await call<{ post: Post }>("/api/posts", { method: "POST", body: JSON.stringify(input) })).post,
  cancelPost: (id: string) => call<unknown>(`/api/posts/${id}`, { method: "DELETE" }),
  retryPost: (id: string) => call<unknown>(`/api/posts/${id}/retry`, { method: "POST" }),
  videoUrl: (film: Film) => (film.videoUrl ? `${API_URL}${film.videoUrl}` : null),
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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    const cost = input.quality === "premium" && input.format !== "motion" ? Math.round(input.durationSec / 5) * 12 : 0;
    if (cost > demoBalance) throw new ApiError(`AI animation needs ${cost} credits for this length.`, 402, true);
    demoBalance -= cost;
    const f: Film = { ...sample(`d${Date.now()}`, input.story.slice(0, 40), "queued", 0), quality: input.quality, credits: cost, story: input.story };
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
  uploadEdit: async (input) => {
    await wait(800);
    const f: Film = { ...sample(`d${Date.now()}`, input.video.name.replace(/\.[a-z0-9]+$/i, ""), "queued", 0), story: `Edit of ${input.video.name}` };
    demoFilms.push(f);
    return { id: f.id, credits: 0 };
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
  videoUrl: () => null,
  videoHeaders: async () => ({}),
};

export const api = DEMO ? demo : real;
