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
  // Made with someone's recipe ("Recipe by @maker"); only on a single reel.
  recipe?: RecipeRef | null;
}

export type Currency = "INR" | "USD" | "AED";

export interface Offer {
  id: string;
  name: string;
  credits: number;
  price: Record<Currency, number>;
  // Packs only: the consumable In-App Purchase sold on the iPhone (story-film/src/lib/billing/catalog.ts).
  appStoreProductId?: string;
}

// GET /api/billing/apple: what the iPhone app needs before buying with the App Store.
export interface AppleBilling {
  // Passed to StoreKit as appAccountToken, so the server credits only this account.
  appAccountToken: string;
  products: { packId: string; productId: string; credits: number }[];
}

// POST /api/billing/apple: the server verified a signed transaction (credited is false when it was
// already credited before, or was refunded). The app finishes the transaction only after this.
export interface AppleCredit {
  credited: boolean;
  revoked: boolean;
  credits: number;
  transactionId: string;
  balance: number;
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
  // Instagram Collab co-author: an approved Jugalbandi partner.
  collaborators?: string[];
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
  // An edit recipe's public id: the server takes its options.
  recipe?: string;
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
// "Use this recipe": only the user's own fields; the server takes the kind, look and length from it.
export type NewRecipeFilm = Pick<NewFilm, "story" | "language" | "quality" | "photo" | "photoConsent" | "keyword" | "brand"> & { recipe: string };

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
  // Your own song's place on Listen (from GET /api/songs/:id).
  listen?: SongListen;
  // Set for someone's public song in the player: its public id (also its `id`) and maker's handle.
  publicId?: string;
  handle?: string;
  // A remix of someone else's song (from GET /api/songs/:id): the credit line it always carries.
  remixOf?: OwnRemixOf | null;
}
export type OwnRemixOf = { gone: false; kind: RemixKind; publicId: string; title: string; handle: string } | { gone: true; kind: RemixKind };

// Listen (mirrors story-film/src/lib/listen.ts).
export type ListenState = "public" | "private" | "taken_down";
export interface SongListen {
  state: ListenState;
  publicId: string | null;
  url: string | null;
  showLyrics: boolean;
  allowRemix: boolean;
  playCount: number;
  likeCount: number;
  dislikeCount: number;
}
export interface PublicSongCard {
  publicId: string;
  title: string;
  handle: string;
  creatorAvatar?: AvatarView;
  genre: string;
  genreLabel: string;
  language: string;
  languageLabel: string;
  mood: string;
  durationSec: number;
  ownVoice: boolean;
  playCount: number;
  likeCount: number;
  audioUrl: string;
  coverUrl: string | null;
}
export type Reaction = "fire" | "dance" | "touched" | "haha" | "respect" | "celebrate";
export interface PublicSong extends PublicSongCard {
  state: ListenState;
  lyrics: string | null;
  allowRemix: boolean;
  publishedAt: string | null;
  reactions: Record<Reaction, number>;
  dislikeCount: number | null;
  mine: boolean;
  myVote: -1 | 0 | 1;
  myReaction: Reaction | null;
  remixOf: { publicId: string; title: string; handle: string } | null;
  // The parent was deleted, made private or taken down. Missing on older servers.
  remixOfGone?: boolean;
}
export interface PublicSongPage {
  song: PublicSong;
  moreLikeThis: PublicSongCard[];
  byCreator: PublicSongCard[];
  // Remix chains (mirrors story-film/src/lib/remixes.ts songFamily). Missing on older servers.
  family?: SongFamily;
  remix?: { kinds: RemixKindInfo[]; blocked: RemixBlock | null };
  // The share of paid credits a song's maker earns from each remix, in basis points (1000 = 10%).
  earnRateBp?: number;
}
// Why this viewer can't remix a public song.
export type RemixBlock = "mine" | "off" | "ownVoice" | "tooLong" | "notPublic";
// A song in a remix chain. A gone node (deleted, private or taken down) has no title, handle or link.
export interface FamilyNode {
  publicId: string | null;
  title: string | null;
  handle: string | null;
  coverUrl: string | null;
  kind: RemixKind | null;
  depth: number;
  playCount: number;
  remixCount: number;
  gone: boolean;
}
export interface SongFamily {
  // Where it came from, original first; `more` songs between the original and the parent aren't listed.
  path: FamilyNode[];
  more: number;
  remixCount: number;
  familySize: number;
  top: FamilyNode[];
  allowRemix: boolean;
  // Only for the song's maker.
  mine: { remixes: number; published: number; earnedHundredths: number } | null;
}
export interface FamilyRow extends FamilyNode {
  key: string;
  level: number;
  more: number;
  current: boolean;
}
export type FamilySort = "top" | "new";
export interface FamilyTree {
  size: number;
  rootTitle: string | null;
  sort: FamilySort;
  rows: FamilyRow[];
}
// Earnings from remixes and reel recipes (mirrors story-film/src/lib/billing/earnings.ts), in hundredths of a credit.
export type EarningSource = "remix" | "recipe";
export interface EarningSubject {
  source: EarningSource;
  subjectRef: string;
  title: string | null;
  coverUrl: string | null;
  publicId: string | null;
  count: number;
  hundredths: number;
  // Recipes only: finished uses that cost nothing, and whether it's still shared.
  freeUses?: number;
  state?: RecipeState;
}
export interface Earnings {
  totalHundredths: number;
  // Whole credits already added to the balance; onTheWay is the rest, in hundredths.
  credited: number;
  onTheWay: number;
  rateBp: number;
  bySubject: EarningSubject[];
}
export interface EarningEvent {
  at: string;
  hundredths: number;
  // Paid with free credits only, so nothing was earned.
  free: boolean;
  kind: RemixKind | null;
  // Null when the remix isn't public.
  remixerHandle: string | null;
  publicId: string | null;
}
export interface EarningDetail {
  title: string | null;
  source?: EarningSource;
  publicId?: string | null;
  cursor: string | null;
  events: EarningEvent[];
}
// Reel recipes (mirrors story-film/src/lib/recipes.ts and recipe-spec.ts).
export type RecipeFormat = "story" | "motion" | "dance" | "edit";
export type RecipeState = "public" | "stopped" | "taken_down";
export type ShapeRole = "hook" | "beat" | "turn" | "payoff" | "cta";
export interface RecipeRef {
  publicId: string;
  name: string;
  handle: string;
  state: RecipeState;
}
export interface RecipeCard {
  publicId: string;
  name: string;
  handle: string;
  format: RecipeFormat;
  style: string | null;
  styleLabel: string | null;
  durationSec: number;
  quality: Quality;
  kidSafe: boolean;
  free: boolean;
  occasions: string[];
  useCount: number;
  posterUrl: string | null;
  languageHint: string | null;
}
export type RecipeHas =
  | { format: "story"; style: string; styleLabel: string; durationSec: number; quality: Quality; shape: { first: ShapeRole; middle: number; last: ShapeRole; tone: string; shots: { role: ShapeRole; intent: string }[] }; music: true }
  | { format: "motion"; durationSec: number; theme: string; slides: string[]; ending: string; music: true }
  | { format: "dance"; durationSec: number; scene: string; bpm: number; dancers: number; lines: number; voice: string }
  | { format: "edit"; durationSec: number; captions: boolean; zooms: boolean; effects: boolean; sounds: boolean; voice: string; ending: string; mix: string[] };
export interface RecipeDetail extends RecipeCard {
  topicHint: string;
  previewUrl: string | null;
  has: RecipeHas;
  rateBp: number;
}
export interface MakerEarns {
  hundredths: number;
  kind: "n" | "small" | "free" | "own";
}
export interface RecipePage {
  state: RecipeState;
  publicId: string;
  mine: boolean;
  recipe: RecipeDetail;
  rails: { sameFestival: RecipeCard[]; byMaker: RecipeCard[]; occasion: string | null };
  // Signed in, someone else's recipe.
  price?: { quality: Quality; credits: number; freeLeft: number | null; standardCredits: number; premiumAvailable: boolean; cinematicAvailable: boolean };
  paidRatioBp?: number;
  makerEarns?: MakerEarns;
  // The maker's own.
  stats?: { useCount: number; earnedHundredths: number; thisWeek: number };
}
export interface FestivalInfo {
  slug: string;
  name: string;
  nameEn: string;
  native: { en: string; hi: string; ar: string };
  date: string | null;
  inDays: number | null;
  allYear: boolean;
}
export interface RecipesHome {
  festival: (FestivalInfo & { thumbs: RecipeCard[] }) | null;
  start: RecipeCard[];
  rails: { trending: RecipeCard[]; new: RecipeCard[]; free: RecipeCard[]; kids: RecipeCard[] };
  collections: (FestivalInfo & { count: number })[];
}
export interface RecipeCollection {
  festival: FestivalInfo & { count: number };
  featured: RecipeCard[];
  recipes: RecipeCard[];
}
// The finished reel's recipe card (M1).
export interface FilmRecipe {
  eligible: boolean;
  reason: "notFinished" | "musicVideo" | "fromRecipe" | "cantRead" | null;
  madeFrom: RecipeRef | null;
  recipe: { publicId: string; name: string; state: RecipeState; url: string; useCount: number; earnedHundredths: number; thisWeek: number } | null;
}
// The Share as a recipe sheet (M3).
export interface RecipeDraft {
  eligible: boolean;
  reason?: string;
  error?: string;
  has?: RecipeHas;
  topicHint?: string;
  needsPreviewConsent?: boolean;
  suggestedName?: string;
  festivals?: FestivalInfo[];
  handle?: string | null;
}

// The Inbox's Remixes group: a named public remix, an anonymous private one, or a day's batch.
export interface RemixInboxItem {
  kind: "published" | "private" | "batch";
  subjectRef: string;
  songTitle: string;
  count: number;
  remixKind: RemixKind | null;
  remixerHandle: string | null;
  publicId: string | null;
  at: string;
  hundredths: number;
}
export interface ListenHome {
  newThisWeek: number;
  new: PublicSongCard[];
  trending: PublicSongCard[];
  bestOf: { genre: string; label: string; songs: PublicSongCard[] }[];
  languages: { code: string; name: string; native: string; count: number }[];
}
// A profile photo: a ready-made avatar's key (lib/avatars.ts) or a photo's URL path on the server.
export type AvatarView = { preset: string; url?: undefined } | { url: string; preset?: undefined } | null;
export type ProfileField = "name" | "handle" | "photo";
// The creator's profile (story-film/src/lib/profile.ts). The handle is the Listen handle.
export interface Profile {
  name: string;
  handle: string | null;
  canChangeAt: string | null;
  suggestions: string[];
  avatar: AvatarView;
  missing: ProfileField[];
  complete: boolean;
}
export interface ProfileInput {
  name?: string;
  handle?: string;
  // A ready-made avatar's key; null removes the photo.
  avatar?: string | null;
}
export interface HandleInfo {
  handle: string | null;
  canChangeAt: string | null;
  suggestions: string[];
}
export type ReportReason = "voice_or_likeness" | "copyright" | "hateful" | "minor_sexual" | "other";
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
  // Why it can't be picked for this song, e.g. "Too long to extend".
  unavailable?: string;
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
  // What the usual Create (two ACE-Step takes) costs, and each kind of remix.
  credits: number;
  // Credits per take, by model. Missing on servers from before per-take prices.
  creditsPerTake?: Record<SongModel, number>;
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
  durationSec: 30 | 60 | 120 | 180 | 240;
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
  // The token of a gift this song answers; the reply goes back to its sender, and the first one is free.
  replyTo?: string;
  // The name the reply is signed with.
  fromName?: string;
}
// A reply's own gift link, made with the song.
export interface ReplyGiftLink {
  token: string;
  url: string;
  free: boolean;
}

// Song gifts (mirrors ownGiftView in story-film/src/lib/gifts.ts).
export type Occasion = "birthday" | "wedding" | "eid" | "diwali" | "anniversary" | "rakhi" | "just_because";
export interface Gift {
  id: string;
  url: string;
  token: string;
  toName: string;
  occasion: Occasion;
  note: string;
  songId: string;
  songTitle: string;
  songReady: boolean;
  isReply: boolean;
  opened: boolean;
  playCount: number;
  lastPlayedAt: string | null;
  sharing: boolean;
  takenDown: boolean;
  createdAt: string;
}
export interface SentGift extends Gift {
  replies: number;
}
export interface ReceivedReply extends Gift {
  fromName: string;
  replyToGiftId: string;
}
export interface NewGift {
  toName: string;
  // How it's signed ("Bhaiya"); empty uses the account's name.
  fromName: string;
  occasion: Occasion;
  note: string;
  // A photo id from uploadPhoto; without one the song's own cover is used.
  photo?: string;
  // How the Arabic gift page speaks to them; null is neutral.
  address?: "her" | "him" | null;
}
// Jugalbandi (mirrors duetView in story-film/src/lib/duets.ts).
export type DuetPhase = "recording_a" | "waiting" | "expired" | "joining" | "join_failed" | "ready" | "declined" | "cancelled" | "solo";
export type DuetAction = "approve" | "retake" | "ask_retake" | "cancel" | "extend" | "reinvite" | "solo" | "join_again" | "invite_handle" | "set_voice";
export interface DuetPart {
  kind: "hum" | "sing" | null;
  sec: number | null;
  audioUrl: string;
}
export interface Duet {
  id: string;
  // "invited": asked by Instagram username, not joined yet.
  role: "a" | "b" | "invited";
  token: string;
  invitedIg: string;
  // My part's own voice (one of mine), or null for an AI singer.
  myVoiceId: string | null;
  voiceCredits: number;
  partAOwnVoice: boolean;
  partBOwnVoice: boolean;
  phase: DuetPhase;
  url: string;
  topic: string;
  genre: string;
  language: string;
  starterName: string;
  partnerName: string;
  starterIg: string;
  partnerIg: string;
  partA: DuetPart | null;
  partB: DuetPart | null;
  // The joined song, for the person who started it (Song Studio, music video, posting).
  songId: string | null;
  songAudioUrl: string | null;
  price: number;
  half: number;
  paidA: number;
  paidB: number;
  freeRetake: boolean;
  retakeCredits: number;
  approvedA: boolean;
  approvedB: boolean;
  askedToRetake: boolean;
  expiresAt: string | null;
  canExtend: boolean;
  declineNote: string;
  createdAt: string;
}
// The account's own consented voices (recorded in Song Studio on the web).
export interface MyVoice {
  id: string;
  name: string;
}
export interface NewDuet {
  topic: string;
  genre: string;
  language: string;
  name: string;
  ig: string;
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

// "gifts" covers gifts and Jugalbandis; "remixes" remixes of your songs and what they earned.
export type PushKind = "songs" | "reels" | "gifts" | "remixes";
export type PushPrefs = Record<PushKind, boolean>;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly needCredits = false,
    // The form field the server refused, for forms that show the problem next to it.
    readonly field?: string,
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
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status, Boolean(body.needCredits), body.field);
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
  createFilm: (input: NewFilm | NewRecipeFilm) => call<{ id: string; credits: number }>("/api/films", { method: "POST", body: JSON.stringify(input) }),
  billing: () => call<Billing>("/api/billing"),
  appleBilling: () => call<AppleBilling>("/api/billing/apple"),
  applePurchase: (signedTransaction: string) => call<AppleCredit>("/api/billing/apple", { method: "POST", body: JSON.stringify({ signedTransaction }) }),
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
    if (input.recipe) form.append("recipe", input.recipe);
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
  // keepRecipe false is "Delete reel and recipe".
  deleteFilm: (id: string, keepRecipe = true) => call<unknown>(`/api/films/${id}${keepRecipe ? "" : "?recipe=stop"}`, { method: "DELETE" }),
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
  createSong: (input: NewSong) => call<{ id: string; ids: string[]; title?: string; gift?: ReplyGiftLink }>("/api/songs", { method: "POST", body: JSON.stringify(input) }),
  createGift: (songId: string, input: NewGift) => call<Gift>(`/api/songs/${songId}/gift`, { method: "POST", body: JSON.stringify(input) }),
  gifts: () => call<{ sent: SentGift[]; replies: ReceivedReply[] }>("/api/gifts"),
  setGiftSharing: (id: string, sharing: boolean) => call<Gift>(`/api/gifts/${id}`, { method: "PATCH", body: JSON.stringify({ sharing }) }),
  duets: async () => (await call<{ duets: Duet[] }>("/api/duets")).duets,
  duet: (id: string) => call<Duet>(`/api/duets/${id}`),
  duetForSong: async (songId: string): Promise<Duet | null> => (await call<{ duets: Duet[] }>(`/api/duets?song=${encodeURIComponent(songId)}`)).duets[0] ?? null,
  startDuet: (input: NewDuet) => call<Duet>("/api/duets", { method: "POST", body: JSON.stringify(input) }),
  duetPart: (id: string, takeId: string) => call<Duet>(`/api/duets/${id}/part`, { method: "POST", body: JSON.stringify({ takeId }) }),
  duetAction: (id: string, action: DuetAction, extra: { handle?: string; voiceId?: string | null } = {}) =>
    call<Duet>(`/api/duets/${id}/action`, { method: "POST", body: JSON.stringify({ action, ...extra }) }),
  joinDuet: (token: string, input: { name: string; ig: string; split: boolean }) => call<Duet>(`/api/j/${token}/join`, { method: "POST", body: JSON.stringify(input) }),
  declineDuet: (token: string, note: string) => call<unknown>(`/api/j/${token}/decline`, { method: "POST", body: JSON.stringify({ note }) }),
  myVoices: async () => (await call<{ voices: MyVoice[] }>("/api/voices")).voices,
  savePushToken: (token: string, platform: "ios" | "android", lang: "en" | "hi" | "ar") => call<unknown>("/api/push-tokens", { method: "POST", body: JSON.stringify({ token, platform, lang }) }),
  deletePushToken: (token: string) => call<unknown>("/api/push-tokens", { method: "DELETE", body: JSON.stringify({ token }) }),
  // Account › Notifications: which pushes the creator wants (mirrors story-film/src/lib/push.ts).
  pushPrefs: () => call<PushPrefs>("/api/push-settings"),
  setPushPrefs: (change: Partial<PushPrefs>) => call<PushPrefs>("/api/push-settings", { method: "PUT", body: JSON.stringify(change) }),
  duetAudioUrl: (path: string) => `${API_URL}${path}`,
  replyInfo: (token: string) => call<{ toName: string; occasion: Occasion; free: boolean }>(`/api/gifts/reply?to=${encodeURIComponent(token)}`),
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
  // Public songs (10-character ids, no dashes) have their own analysis route.
  songAnalysis: (id: string) => call<SongAnalysis>(id.includes("-") ? `/api/songs/${id}/analysis` : `/api/listen/songs/${id}/analysis`),
  // Profile: name, @handle and photo.
  profile: () => call<Profile>("/api/me/profile"),
  // Free @handle ideas for a name typed in the profile form.
  handleIdeas: async (name: string) => (await call<{ suggestions: string[] }>(`/api/me/profile?suggest=${encodeURIComponent(name)}`)).suggestions,
  saveProfile: (input: ProfileInput) => call<Profile>("/api/me/profile", { method: "PUT", body: JSON.stringify(input) }),
  uploadProfilePhoto: async (photo: { uri: string; name: string; type: string }) => {
    const form = new FormData();
    form.append("photo", photo as unknown as Blob);
    const cookie = await authClient.getCookie();
    const res = await fetch(`${API_URL}/api/me/profile/photo`, { method: "POST", body: form, credentials: "omit", headers: cookie ? { Cookie: cookie } : {} });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(body.error ?? `Upload failed (${res.status})`, res.status, false, "photo");
    return body as Profile;
  },
  // Listen.
  handle: () => call<HandleInfo>("/api/me/handle"),
  checkHandle: (handle: string) => call<{ handle: string; ok: boolean; problem: string | null }>(`/api/me/handle?check=${encodeURIComponent(handle)}`),
  setHandle: async (handle: string) => (await call<{ handle: string }>("/api/me/handle", { method: "PUT", body: JSON.stringify({ handle }) })).handle,
  publishSong: (id: string, input: { title?: string; showLyrics: boolean; allowRemix: boolean }) => call<SongListen>(`/api/songs/${id}/publish`, { method: "POST", body: JSON.stringify(input) }),
  unpublishSong: (id: string) => call<SongListen>(`/api/songs/${id}/publish`, { method: "DELETE" }),
  listen: (lang?: string) => call<ListenHome>(`/api/listen${lang ? `?lang=${encodeURIComponent(lang)}` : ""}`),
  relatedSongs: async (seed: string | undefined, exclude: string[]) =>
    (await call<{ songs: PublicSongCard[] }>(`/api/listen/related?${new URLSearchParams({ ...(seed ? { seed } : {}), exclude: exclude.slice(-300).join(",") })}`)).songs,
  publicSong: (publicId: string) => call<PublicSongPage>(`/api/listen/songs/${publicId}`),
  countPlay: (publicId: string) => call<{ counted: boolean }>(`/api/listen/songs/${publicId}/play`, { method: "POST" }),
  voteSong: (publicId: string, value: -1 | 0 | 1) => call<unknown>(`/api/listen/songs/${publicId}/vote`, { method: "PUT", body: JSON.stringify({ value }) }),
  reactSong: (publicId: string, kind: Reaction | null) => call<unknown>(`/api/listen/songs/${publicId}/reaction`, { method: "PUT", body: JSON.stringify({ kind }) }),
  reportSong: (publicId: string, reason: ReportReason, details: string) => call<unknown>(`/api/listen/songs/${publicId}/report`, { method: "POST", body: JSON.stringify({ reason, details }) }),
  // The page the native share sheet links to. Built on the address the phone reaches (in
  // development that's a LAN IP or tunnel, like shareLink), which is the public URL in production.
  publicSongLink: (publicId: string) => `${API_URL}/s/${publicId}`,
  // Remix chains and earnings.
  familyTree: (publicId: string, sort: FamilySort, branch?: string) =>
    call<FamilyTree>(`/api/listen/songs/${publicId}/family?${new URLSearchParams({ sort, ...(branch ? { branch } : {}) })}`),
  setAllowRemix: (id: string, allow: boolean) => call<{ allowRemix: boolean }>(`/api/songs/${id}/remixes`, { method: "PATCH", body: JSON.stringify({ allow }) }),
  earnings: (source: EarningSource | "all" = "all") => call<Earnings>(`/api/me/earnings?source=${source}`),
  earningDetail: (ref: string, cursor?: string | null) => call<EarningDetail>(`/api/me/earnings/${encodeURIComponent(ref)}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
  remixInbox: async () => (await call<{ items: RemixInboxItem[] }>("/api/me/remixes")).items,
  // Reel recipes.
  filmRecipe: (id: string) => call<FilmRecipe>(`/api/films/${id}/recipe`),
  recipeDraft: (id: string, lang: string) => call<RecipeDraft>(`/api/films/${id}/recipe/draft?lang=${encodeURIComponent(lang)}`),
  shareRecipe: (id: string, input: { name: string; occasions: string[]; preview: "reel" | "look" }) => call<{ publicId: string; url: string }>(`/api/films/${id}/recipe`, { method: "POST", body: JSON.stringify(input) }),
  recipe: (publicId: string, lang: string) => call<RecipePage>(`/api/recipes/public/${publicId}?lang=${encodeURIComponent(lang)}`),
  recipesHome: (lang: string, tz: string) => call<RecipesHome>(`/api/recipes/home?${new URLSearchParams({ lang, tz })}`),
  recipeList: (q: { list?: string; format?: RecipeFormat; maker?: string }) => call<{ recipes: RecipeCard[]; cursor: number | null }>(`/api/recipes?${new URLSearchParams(q as Record<string, string>)}`),
  recipeCollection: (slug: string, lang: string, format?: RecipeFormat) => call<RecipeCollection>(`/api/recipes?${new URLSearchParams({ collection: slug, lang, ...(format ? { format } : {}) })}`),
  setRecipeSharing: (publicId: string, on: boolean) => call<{ state: RecipeState }>(`/api/recipes/${publicId}/${on ? "publish" : "unpublish"}`, { method: "POST" }),
  editRecipe: (publicId: string, input: { name?: string; occasions?: string[] }) => call<{ name: string; occasions: string[] }>(`/api/recipes/${publicId}`, { method: "PATCH", body: JSON.stringify(input) }),
  reportRecipe: (publicId: string, reason: ReportReason, details: string) => call<unknown>(`/api/recipes/public/${publicId}/report`, { method: "POST", body: JSON.stringify({ reason, details }) }),
  recipeLink: (publicId: string) => `${API_URL}/r/${publicId}`,
  recipePosterUrl: (path: string | null) => (path ? `${API_URL}${path}` : null),
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
const demoDuetBase: Duet = {
  id: "d1", role: "a", token: "demoDuet01", invitedIg: "", myVoiceId: null, voiceCredits: 4, partAOwnVoice: false, partBOwnVoice: false, phase: "waiting", url: "https://reelkar.app/j/demoDuet01", topic: "Chai vs coffee, settled in song", genre: "bollywood-romantic", language: "hinglish",
  starterName: "Arjun", partnerName: "", starterIg: "arjun.sings", partnerIg: "", partA: { kind: "hum", sec: 28, audioUrl: "/demo" }, partB: null, songId: null, songAudioUrl: null,
  price: 3, half: 1, paidA: 3, paidB: 0, freeRetake: true, retakeCredits: 1, approvedA: false, approvedB: false, askedToRetake: false,
  expiresAt: new Date(Date.now() + 47 * 3600_000).toISOString(), canExtend: false, declineNote: "", createdAt: new Date().toISOString(),
};
const demoDuets: Duet[] = [{ ...demoDuetBase }];
const demoGifts: SentGift[] = [
  { id: "g1", url: "https://reelkar.app/g/demoGift1x", token: "demoGift1x", toName: "Priya", occasion: "birthday", note: "Play it loud!", songId: "s1", songTitle: "Baarish wali chai", songReady: true, isReply: false, opened: true, playCount: 2, lastPlayedAt: new Date(Date.now() - 3 * 3600_000).toISOString(), sharing: true, takenDown: false, createdAt: new Date(Date.now() - 86400_000).toISOString(), replies: 1 },
];
const demoReplies: ReceivedReply[] = [
  { id: "g2", url: "https://reelkar.app/g/demoReply1", token: "demoReply1", toName: "You", occasion: "birthday", note: "", songId: "s2", songTitle: "Thank you bhaiya", songReady: true, isReply: true, opened: false, playCount: 0, lastPlayedAt: null, sharing: true, takenDown: false, createdAt: new Date(Date.now() - 3600_000).toISOString(), fromName: "Priya", replyToGiftId: "g1" },
];
const demoPush: PushPrefs = { songs: true, reels: true, gifts: true, remixes: true };
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
let demoHandle: string | null = null;
const demoProfile: { name: string; avatar: AvatarView } = { name: "", avatar: null };
const demoIdeas = (name: string) => {
  const w = name.toLowerCase().replace(/[^a-z ]/g, "").split(/\s+/).filter(Boolean);
  return w.length ? [w.join(""), w.join("."), `${w[0]}.sings`].map((h) => h.slice(0, 20)) : ["priya.sings", "priya_music", "priyacooks"];
};
function demoProfileView(): Profile {
  const missing = [!demoProfile.name && "name", !demoHandle && "handle", !demoProfile.avatar && "photo"].filter(Boolean) as ProfileField[];
  return { ...demoProfile, handle: demoHandle, canChangeAt: null, suggestions: demoHandle ? [] : demoIdeas(demoProfile.name), missing, complete: !missing.length };
}
const demoRecipes: { source: string }[] = [];
const demoFestival: FestivalInfo = { slug: "diwali", name: "Diwali", nameEn: "Diwali", native: { en: "Diwali", hi: "दिवाली", ar: "ديوالي" }, date: "2026-11-08", inDays: 2, allYear: false };
const demoHas: RecipeHas = {
  format: "story",
  style: "animated",
  styleLabel: "3D cartoon",
  durationSec: 30,
  quality: "premium",
  shape: {
    first: "hook",
    middle: 4,
    last: "payoff",
    tone: "warm",
    shots: [
      { role: "hook", intent: "Open on a surprising question about the topic" },
      { role: "beat", intent: "Show the everyday moment before the change" },
      { role: "beat", intent: "Bring in a small problem" },
      { role: "turn", intent: "Something unexpected happens" },
      { role: "beat", intent: "Everyone comes together" },
      { role: "payoff", intent: "A warm ending that answers the opening question" },
    ],
  },
  music: true,
};
const demoRecipeCard = (publicId: string, name: string, handle: string, format: RecipeFormat, free: boolean, useCount: number): RecipeCard => ({
  publicId, name, handle, format, style: format === "story" ? "animated" : null, styleLabel: format === "story" ? "3D cartoon" : null, durationSec: 30, quality: free ? "standard" : "premium", kidSafe: format === "dance", free, occasions: ["diwali"], useCount, posterUrl: null, languageHint: "hi",
});
const demoRecipeCards: RecipeCard[] = [
  demoRecipeCard("demoRecipe1", "Diya Night", "meera.makes", "story", false, 1200),
  demoRecipeCard("demoRecipe2", "3 Diwali savings tips", "paisa.tips", "motion", true, 310),
  demoRecipeCard("demoRecipe3", "Phuljhadi dance", "kids.dhol", "dance", true, 95),
];
const demoCard = (publicId: string, title: string, handle: string, genre: string, genreLabel: string, language: string, languageLabel: string): PublicSongCard => ({
  publicId,
  title,
  handle,
  genre,
  genreLabel,
  language,
  languageLabel,
  mood: "energetic",
  durationSec: 90,
  ownVoice: false,
  playCount: 120,
  likeCount: 18,
  audioUrl: "",
  coverUrl: null,
});
const demoCards: PublicSongCard[] = [
  demoCard("aaaaaaaaaa", "Dhol di awaaz", "harjeet.beats", "bhangra", "Bhangra", "pa", "Punjabi"),
  demoCard("bbbbbbbbbb", "Chai aur baarish", "meera.sings", "lofi-hindi", "Lo-fi Hindi", "hi", "Hindi"),
  demoCard("cccccccccc", "Ya habibi", "noor.music", "khaleeji", "Khaleeji", "ar", "Arabic"),
];

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

// What the server opens on someone else's song (story-film/src/lib/remixes.ts openKindList).
const DEMO_REMIX_KINDS: RemixKindInfo[] = [
  { kind: "cover", label: "Cover", help: "Sing it again in another style.", credits: 1, style: "required", part: false, extend: false, lyrics: false, bars: false },
  { kind: "extend", label: "Extend", help: "Make it longer.", credits: 1, style: "optional", part: false, extend: true, lyrics: true, bars: false },
  { kind: "rap", label: "Add a rap", help: "Pick a part and AI writes rap bars.", credits: 1, style: "optional", part: true, extend: false, lyrics: false, bars: true },
];

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
    const format = "format" in input ? input.format : undefined;
    const drawn = format === "motion" || format === "dance";
    const perShot = input.quality === "cinematic" ? 30 : input.quality === "premium" ? 12 : 0;
    const cost = drawn ? 0 : Math.round(("durationSec" in input ? input.durationSec : 30) / 5) * perShot;
    if (cost > demoBalance) throw new ApiError(`${input.quality === "cinematic" ? "A Cinematic video" : "AI animation"} needs ${cost} credits for this length.`, 402, true);
    demoBalance -= cost;
    const f: Film = { ...sample(`d${Date.now()}`, input.story.slice(0, 40), "queued", 0), quality: drawn ? "standard" : input.quality, credits: cost, story: input.story, format: format ?? "story" };
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
        { id: "starter", name: "Starter", credits: 50, price: { INR: 24900, USD: 399, AED: 1500 }, appStoreProductId: "app.reelkar.credits.starter" },
        { id: "creator", name: "Creator", credits: 150, price: { INR: 64900, USD: 999, AED: 3700 }, appStoreProductId: "app.reelkar.credits.creator" },
        { id: "pro", name: "Pro", credits: 400, price: { INR: 149900, USD: 2499, AED: 9200 }, appStoreProductId: "app.reelkar.credits.pro" },
      ],
      plans: [
        { id: "creator_monthly", name: "Creator monthly", credits: 120, price: { INR: 49900, USD: 799, AED: 2900 } },
        { id: "pro_monthly", name: "Pro monthly", credits: 350, price: { INR: 129900, USD: 1999, AED: 7500 } },
      ],
    }
  ),
  appleBilling: async () => (
    await wait(150),
    {
      appAccountToken: "00000000-0000-4000-8000-000000000000",
      products: [
        { packId: "starter", productId: "app.reelkar.credits.starter", credits: 50 },
        { packId: "creator", productId: "app.reelkar.credits.creator", credits: 150 },
        { packId: "pro", productId: "app.reelkar.credits.pro", credits: 400 },
      ],
    }
  ),
  // The demo can't read Apple's signed transaction; it credits a Starter pack.
  applePurchase: async () => {
    await wait(300);
    const credits = 50;
    demoBalance += credits;
    return { credited: true, revoked: false, credits, transactionId: `demo-${Date.now()}`, balance: demoBalance };
  },
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
  songs: async () => (await wait(300), { songs: [...demoSongs], credits: 2, creditsPerTake: { "ace-step": 1, lyria: 2 }, remixCredits: { cover: 1, extend: 1, replace: 1, rap: 1 }, available: true }),
  song: async (id) => {
    await wait(200);
    const s = demoSongs.find((x) => x.id === id);
    if (!s) throw new ApiError("Song not found", 404);
    return s;
  },
  createSong: async (input) => {
    await wait(500);
    const free = Boolean(input.replyTo);
    if (!free && demoBalance < 4) throw new ApiError("A song costs 4 credits.", 402, true);
    if (!free) demoBalance -= 4;
    const ids = Array.from({ length: input.takes }, (_, i) => `s${Date.now()}${i}`);
    ids.forEach((id, i) => demoSongs.unshift({ ...demoSong(id, input.takes > 1 ? `${input.title} (v${i + 1})` : input.title, input.genre), status: "queued", audioUrl: null, lyrics: input.lyrics }));
    const gift = input.replyTo ? { token: "demoReply2", url: "https://reelkar.app/g/demoReply2", free } : undefined;
    return { id: ids[0], ids, gift };
  },
  createGift: async (songId, input) => {
    await wait(400);
    const s = demoSongs.find((x) => x.id === songId);
    const g: SentGift = {
      id: `g${Date.now()}`,
      url: "https://reelkar.app/g/x7Kp2abcdE",
      token: "x7Kp2abcdE",
      toName: input.toName,
      occasion: input.occasion,
      note: input.note,
      songId,
      songTitle: s?.title ?? "Song",
      songReady: s?.status === "completed",
      isReply: false,
      opened: false,
      playCount: 0,
      lastPlayedAt: null,
      sharing: true,
      takenDown: false,
      createdAt: new Date().toISOString(),
      replies: 0,
    };
    demoGifts.unshift(g);
    return g;
  },
  gifts: async () => (await wait(300), { sent: [...demoGifts], replies: [...demoReplies] }),
  duets: async () => (await wait(300), [...demoDuets]),
  duet: async (id) => {
    await wait(200);
    const d = demoDuets.find((x) => x.id === id);
    if (!d) throw new ApiError("Jugalbandi not found", 404);
    return d;
  },
  duetForSong: async () => null,
  startDuet: async (input) => {
    await wait(400);
    if (demoBalance < 6) throw new ApiError("A Jugalbandi costs 6 credits.", 402, true);
    demoBalance -= 6;
    const d: Duet = { ...demoDuetBase, id: `d${Date.now()}`, topic: input.topic, genre: input.genre, language: input.language, starterName: input.name, starterIg: input.ig, phase: "recording_a", partA: null, createdAt: new Date().toISOString() };
    demoDuets.unshift(d);
    return d;
  },
  duetPart: async (id) => {
    await wait(600);
    const d = demoDuets.find((x) => x.id === id)!;
    if (d.role === "a") Object.assign(d, { partA: { kind: "hum", sec: 24, audioUrl: "/demo" }, phase: d.partB ? "joining" : "waiting", expiresAt: new Date(Date.now() + 48 * 3600_000).toISOString() });
    else Object.assign(d, { partB: { kind: "sing", sec: 22, audioUrl: "/demo" }, phase: "joining" });
    return d;
  },
  duetAction: async (id, action) => {
    await wait(300);
    const d = demoDuets.find((x) => x.id === id)!;
    if (action === "approve") Object.assign(d, d.role === "a" ? { approvedA: true } : { approvedB: true });
    if (action === "cancel") d.phase = "cancelled";
    return d;
  },
  duetAudioUrl: (path) => path,
  joinDuet: async (token) => {
    await wait(300);
    const d = demoDuets.find((x) => x.token === token) ?? demoDuets[0];
    return Object.assign(d, { role: "b" as const });
  },
  declineDuet: async () => (await wait(200), {}),
  myVoices: async () => (await wait(200), [{ id: "00000000-0000-4000-8000-000000000001", name: "My voice" }]),
  savePushToken: async () => ({}),
  deletePushToken: async () => ({}),
  pushPrefs: async () => (await wait(200), { ...demoPush }),
  setPushPrefs: async (change) => (await wait(200), Object.assign(demoPush, change), { ...demoPush }),
  replyInfo: async () => (await wait(200), { toName: "Priya", occasion: "birthday" as const, free: true }),
  setGiftSharing: async (id, sharing) => {
    await wait(200);
    const g = demoGifts.find((x) => x.id === id);
    if (!g) throw new ApiError("Gift not found", 404);
    g.sharing = sharing;
    return g;
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
  profile: async () => (await wait(200), demoProfileView()),
  handleIdeas: async (name) => (await wait(150), demoIdeas(name)),
  saveProfile: async (input) => {
    await wait(300);
    if (input.name?.trim()) demoProfile.name = input.name.trim();
    if (input.handle?.trim()) demoHandle = input.handle.trim().toLowerCase().replace(/^@/, "");
    if (input.avatar !== undefined) demoProfile.avatar = input.avatar ? { preset: input.avatar } : null;
    return demoProfileView();
  },
  // Demo mode has no server to keep the photo; the form shows the picked photo itself.
  uploadProfilePhoto: async (photo) => (await wait(500), (demoProfile.avatar = { url: photo.uri }), demoProfileView()),
  handle: async () => (await wait(200), { handle: demoHandle, canChangeAt: null, suggestions: demoHandle ? [] : ["priya.sings", "priya_music", "priyacooks"] }),
  checkHandle: async (handle) => (await wait(150), { handle, ok: /^[a-z0-9._]{3,20}$/.test(handle), problem: /^[a-z0-9._]{3,20}$/.test(handle) ? null : "Use letters a-z, numbers, dots and underscores." }),
  setHandle: async (handle) => (await wait(200), (demoHandle = handle.toLowerCase())),
  publishSong: async (id, input) => {
    await wait(400);
    const s = demoSongs.find((x) => x.id === id)!;
    if (input.title) s.title = input.title;
    s.listen = { state: "public", publicId: `demo${id}`.padEnd(10, "x").slice(0, 10), url: null, showLyrics: input.showLyrics, allowRemix: input.allowRemix, playCount: 0, likeCount: 0, dislikeCount: 0 };
    return s.listen;
  },
  unpublishSong: async (id) => {
    await wait(300);
    const s = demoSongs.find((x) => x.id === id)!;
    s.listen = { ...(s.listen as SongListen), state: "private" };
    return s.listen;
  },
  listen: async () => (await wait(300), { newThisWeek: demoCards.length, new: demoCards, trending: demoCards.slice(0, 2), bestOf: [{ genre: "bhangra", label: "Bhangra", songs: demoCards }], languages: [{ code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ", count: 1 }, { code: "hi", name: "Hindi", native: "हिन्दी", count: 2 }] }),
  relatedSongs: async (_seed, exclude) => (await wait(200), demoCards.filter((c) => !exclude.includes(c.publicId))),
  publicSong: async (publicId) => {
    await wait(300);
    const c = demoCards.find((x) => x.publicId === publicId) ?? demoCards[0];
    return {
      song: { ...c, state: "public", lyrics: "[Chorus]\nDhol baje, dil nache", allowRemix: true, publishedAt: new Date().toISOString(), reactions: { fire: 4, dance: 0, touched: 0, haha: 0, respect: 0, celebrate: 0 }, dislikeCount: null, mine: false, myVote: 0, myReaction: null, remixOf: null },
      moreLikeThis: demoCards.filter((x) => x.publicId !== c.publicId),
      byCreator: [],
      family: {
        path: [],
        more: 0,
        remixCount: demoCards.length - 1,
        familySize: demoCards.length,
        top: demoCards.filter((x) => x.publicId !== c.publicId).map((x) => ({ publicId: x.publicId, title: x.title, handle: x.handle, coverUrl: x.coverUrl, kind: "cover", depth: 1, playCount: x.playCount, remixCount: 0, gone: false })),
        allowRemix: true,
        mine: null,
      },
      remix: { kinds: DEMO_REMIX_KINDS, blocked: null },
      earnRateBp: 1000,
    };
  },
  countPlay: async () => ({ counted: true }),
  voteSong: async () => ({}),
  reactSong: async () => ({}),
  reportSong: async () => (await wait(300), {}),
  publicSongLink: (publicId) => `https://reelkar.app/s/${publicId}`,
  familyTree: async (publicId, sort) => {
    await wait(300);
    const c = demoCards.find((x) => x.publicId === publicId) ?? demoCards[0];
    const node = (x: PublicSongCard, level: number, kind: RemixKind | null): FamilyRow => ({ key: x.publicId, publicId: x.publicId, title: x.title, handle: x.handle, coverUrl: x.coverUrl, kind, depth: level, playCount: x.playCount, remixCount: 0, gone: false, level, more: 0, current: x.publicId === c.publicId });
    const rows = [node(demoCards[0], 0, null), ...demoCards.slice(1).map((x) => node(x, 1, "cover"))];
    return { size: rows.length, rootTitle: demoCards[0].title, sort, rows: sort === "new" ? [rows[0], ...rows.slice(1).reverse()] : rows };
  },
  setAllowRemix: async (_id, allow) => (await wait(200), { allowRemix: allow }),
  earnings: async () => (await wait(300), { totalHundredths: 230, credited: 2, onTheWay: 30, rateBp: 1000, bySubject: [{ source: "remix" as const, subjectRef: "s1", title: "Baarish wali chai", coverUrl: null, publicId: null, count: 23, hundredths: 230 }] }),
  earningDetail: async () => (
    await wait(300),
    {
      title: "Baarish wali chai",
      cursor: null,
      events: [
        { at: new Date().toISOString(), hundredths: 10, free: false, kind: "cover", remixerHandle: "sana.sings", publicId: demoCards[0].publicId },
        { at: new Date(Date.now() - 86400_000).toISOString(), hundredths: 10, free: false, kind: "rap", remixerHandle: null, publicId: null },
        { at: new Date(Date.now() - 2 * 86400_000).toISOString(), hundredths: 0, free: true, kind: "cover", remixerHandle: null, publicId: null },
      ],
    }
  ),
  remixInbox: async () => (await wait(200), [{ kind: "published" as const, subjectRef: "s1", songTitle: "Baarish wali chai", count: 1, remixKind: "cover", remixerHandle: "sana.sings", publicId: demoCards[0].publicId, at: new Date(Date.now() - 2 * 3600_000).toISOString(), hundredths: 10 }]),
  filmRecipe: async (id) => (await wait(200), { eligible: !demoRecipes.some((r) => r.source === id), reason: null, madeFrom: null, recipe: demoRecipes.find((r) => r.source === id) ? { publicId: "demoRecipe1", name: "Diya Night", state: "public" as const, url: "https://reelkar.app/r/demoRecipe1", useCount: 38, earnedHundredths: 2140, thisWeek: 3 } : null }),
  recipeDraft: async (id) => (
    await wait(600),
    {
      eligible: true,
      has: demoHas,
      topicHint: "A Diwali memory, your shop, your family…",
      needsPreviewConsent: false,
      suggestedName: demoFilms.find((f) => f.id === id)?.title?.slice(0, 40) ?? "My recipe",
      festivals: [demoFestival, { ...demoFestival, slug: "uae-national-day", name: "Eid Al Etihad", nameEn: "Eid Al Etihad", date: "2026-12-02", inDays: 26 }, { ...demoFestival, slug: "birthday", name: "Birthday", nameEn: "Birthday", date: null, inDays: null, allYear: true }],
      handle: demoHandle,
    }
  ),
  shareRecipe: async (id) => (await wait(500), demoRecipes.push({ source: id }), { publicId: "demoRecipe1", url: "https://reelkar.app/r/demoRecipe1" }),
  recipe: async (publicId) => (
    await wait(300),
    {
      state: "public" as const,
      publicId,
      mine: false,
      recipe: { ...demoRecipeCards[0], publicId, topicHint: "A Diwali memory, your shop, your family…", previewUrl: null, has: demoHas, rateBp: 1000 },
      rails: { sameFestival: demoRecipeCards.slice(1), byMaker: [], occasion: "diwali" },
      price: { quality: "premium" as const, credits: 72, freeLeft: 2, standardCredits: 1, premiumAvailable: true, cinematicAvailable: false },
      paidRatioBp: 8823,
      makerEarns: { hundredths: 635, kind: "n" as const },
    }
  ),
  recipesHome: async () => (
    await wait(300),
    {
      festival: { ...demoFestival, thumbs: demoRecipeCards },
      start: demoRecipeCards,
      rails: { trending: demoRecipeCards, new: [...demoRecipeCards].reverse(), free: demoRecipeCards.filter((c) => c.free), kids: demoRecipeCards.filter((c) => c.kidSafe) },
      collections: [{ ...demoFestival, count: 3 }, { ...demoFestival, slug: "holi", name: "Holi", nameEn: "Holi", native: { en: "Holi", hi: "होली", ar: "هولي" }, date: "2027-03-22", inDays: 136, count: 0 }],
    }
  ),
  recipeList: async () => (await wait(300), { recipes: demoRecipeCards, cursor: null }),
  recipeCollection: async (slug) => (await wait(300), { festival: { ...demoFestival, slug, count: demoRecipeCards.length }, featured: demoRecipeCards.slice(0, 1), recipes: demoRecipeCards.slice(1) }),
  setRecipeSharing: async (_id, on) => (await wait(200), { state: on ? ("public" as const) : ("stopped" as const) }),
  editRecipe: async (_id, input) => (await wait(200), { name: input.name ?? "Diya Night", occasions: input.occasions ?? [] }),
  reportRecipe: async () => (await wait(300), {}),
  recipeLink: (publicId) => `https://reelkar.app/r/${publicId}`,
  recipePosterUrl: () => null,
  videoUrl: () => null,
  previewUri: () => null,
  videoHeaders: async () => ({}),
  songCoverUrl: () => null,
};

export const api = DEMO ? demo : real;
