import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, notInArray, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { creatorProfile, giftReportReason, remixLink, song, songPlay, songReaction, songReactionKind, songReport, songVote } from "@/lib/db/schema";
import { newGiftToken } from "@/lib/gifts";
import { findLanguage } from "@/lib/languages";
import { findGenre } from "@/lib/songs/styles";
import type { Song } from "@/lib/songs/songs";

// Listen (docs/PLAN.md item 44, design/listen/flow-spec.md): published songs, their rails, the
// related songs Autoplay plays next, and plays, likes and reactions.

// ---------- Handles ----------

export const HANDLE = /^[a-z0-9._]{3,20}$/;
const HANDLE_CHANGE_DAYS = 30;
const RESERVED = new Set(["reelkar", "admin", "administrator", "support", "help", "listen", "official", "team", "staff", "mod", "moderator", "api", "root", "system", "about", "settings", "me", "you", "null", "undefined", "song", "songs", "gift", "gifts"]);

// Why a handle can't be used, or null when it can (taken handles are checked separately).
export function handleProblem(raw: string): string | null {
  const h = raw.trim().toLowerCase();
  if (h.length < 3) return "Use at least 3 characters.";
  if (h.length > 20) return "Use 20 characters or fewer.";
  if (!HANDLE.test(h)) return "Use letters a-z, numbers, dots and underscores.";
  if (/^[._]|[._]$|\.\./.test(h)) return "Start and end with a letter or number.";
  if (RESERVED.has(h) || h.startsWith("reelkar")) return "That one's reserved. Try another.";
  return null;
}

// A few free handles from the account's name ("Priya Sharma" -> priyasharma, priya.sharma, ...).
export async function suggestHandles(db: Db, name: string): Promise<string[]> {
  const words = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .split(/\s+/)
    .filter((w) => w && !/^creator$|^\d+$/.test(w));
  const base = words.length ? words : ["creator"];
  const ideas = [base.join(""), base.join("."), base.join("_"), `${base[0]}.sings`, `${base[0]}.music`, `${base.join("")}${100 + Math.floor(Math.random() * 900)}`]
    .map((h) => h.slice(0, 20))
    .filter((h, i, a) => !handleProblem(h) && a.indexOf(h) === i);
  if (!ideas.length) return [];
  const taken = new Set((await db.select({ h: creatorProfile.handle }).from(creatorProfile).where(inArray(creatorProfile.handle, ideas))).map((r) => r.h));
  return ideas.filter((h) => !taken.has(h)).slice(0, 3);
}

export async function getProfile(db: Db, userId: string) {
  const [row] = await db.select().from(creatorProfile).where(eq(creatorProfile.userId, userId));
  return row;
}

export function nextHandleChange(changedAt: Date): Date {
  return new Date(changedAt.getTime() + HANDLE_CHANGE_DAYS * 86400_000);
}

export async function handleTaken(db: Db, handle: string, exceptUserId?: string): Promise<boolean> {
  const [row] = await db.select({ userId: creatorProfile.userId }).from(creatorProfile).where(eq(creatorProfile.handle, handle.trim().toLowerCase()));
  return Boolean(row && row.userId !== exceptUserId);
}

export async function setHandle(db: Db, userId: string, raw: string, now = new Date()): Promise<{ handle: string } | { error: string; status: number }> {
  const handle = raw.trim().toLowerCase().replace(/^@/, "");
  const problem = handleProblem(handle);
  if (problem) return { error: problem, status: 400 };
  const current = await getProfile(db, userId);
  if (current?.handle === handle) return { handle };
  if (current && nextHandleChange(current.handleChangedAt) > now) {
    return { error: `You can change your handle again on ${nextHandleChange(current.handleChangedAt).toISOString().slice(0, 10)}.`, status: 400 };
  }
  if (await handleTaken(db, handle, userId)) return { error: `@${handle} is taken. Try another.`, status: 409 };
  try {
    await db
      .insert(creatorProfile)
      .values({ userId, handle, handleChangedAt: now })
      .onConflictDoUpdate({ target: creatorProfile.userId, set: { handle, handleChangedAt: now } });
  } catch (err) {
    if (/unique/i.test(String((err as { cause?: unknown }).cause ?? err))) return { error: `@${handle} is taken. Try another.`, status: 409 };
    throw err;
  }
  return { handle };
}

// ---------- Publish ----------

export const publishSchema = z.object({
  title: z.string().trim().min(1, "Give it a title").max(80).optional(),
  showLyrics: z.boolean().default(true),
  allowRemix: z.boolean().default(true),
});

export const PUBLIC_ID = /^[2-9a-km-zA-HJ-NP-Z]{10}$/;

// Publishes the maker's own finished song. `check` runs the existing song safety checks on the
// title and lyrics (the route passes the real-artist check); if it throws, the song stays private.
export async function publishSong(
  db: Db,
  userId: string,
  id: string,
  input: z.infer<typeof publishSchema>,
  check: (texts: string[]) => Promise<void>,
  now = new Date(),
): Promise<{ song: Song } | { error: string; status: number; needHandle?: boolean }> {
  const [s] = await db.select().from(song).where(and(eq(song.id, id), eq(song.userId, userId)));
  if (!s) return { error: "Song not found", status: 404 };
  if (s.status !== "completed" || !s.outputPath) return { error: "Only a finished song can be published.", status: 400 };
  if (s.takenDownAt) return { error: "This song was removed from Listen after a report, so it can't be published again.", status: 403 };
  if (!(await getProfile(db, userId))) return { error: "Pick a handle first.", status: 400, needHandle: true };
  const title = input.title ?? s.title;
  await check([title, input.showLyrics ? s.lyrics : ""]);
  for (let i = 0; ; i++) {
    try {
      const [row] = await db
        .update(song)
        .set({ title, showLyrics: input.showLyrics, allowRemix: input.allowRemix, publishedAt: s.publishedAt ?? now, publicId: s.publicId ?? newGiftToken() })
        .where(eq(song.id, s.id))
        .returning();
      return { song: row };
    } catch (err) {
      if (i >= 4 || !/public_id|unique/i.test(String((err as { cause?: unknown }).cause ?? err))) throw err;
    }
  }
}

// Back to private. The public id is kept, so publishing again brings the old link back.
export async function unpublishSong(db: Db, userId: string, id: string): Promise<Song | undefined> {
  const [row] = await db
    .update(song)
    .set({ publishedAt: null })
    .where(and(eq(song.id, id), eq(song.userId, userId)))
    .returning();
  return row;
}

// ---------- Public songs ----------

export const listed = () => and(isNotNull(song.publishedAt), isNull(song.takenDownAt), eq(song.status, "completed"), isNotNull(song.outputPath));

export const publicColumns = { song, handle: creatorProfile.handle };
export type PublicRow = { song: Song; handle: string };

export type PublicState = "public" | "private" | "taken_down";

export function publicState(s: Song): PublicState {
  if (s.takenDownAt) return "taken_down";
  return s.publishedAt && s.status === "completed" && s.outputPath ? "public" : "private";
}

// The song behind a public link, whatever its state now (so the page can say it's gone).
export async function publicSong(db: Db, publicId: string): Promise<PublicRow | null> {
  if (!PUBLIC_ID.test(publicId)) return null;
  const [row] = await db.select(publicColumns).from(song).innerJoin(creatorProfile, eq(creatorProfile.userId, song.userId)).where(eq(song.publicId, publicId));
  return row ?? null;
}

const LANGUAGE_LABELS: Record<string, { name: string; native: string }> = {
  hinglish: { name: "Hinglish", native: "Hinglish" },
  pa: { name: "Punjabi", native: "ਪੰਜਾਬੀ" },
};

export function languageLabel(code: string): { name: string; native: string } {
  const l = findLanguage(code);
  return l ? { name: l.name, native: l.native } : (LANGUAGE_LABELS[code] ?? { name: code, native: code });
}

export const REACTIONS = songReactionKind.enumValues;
export type Reaction = (typeof REACTIONS)[number];
// Reaction counts show once a reaction has 3 (owner decision, 2026-11-06).
export const REACTION_COUNT_FROM = 3;

// A song tile: what rails and the queue need. No ids beyond the public one.
export function publicSongCard(r: PublicRow) {
  const s = r.song;
  return {
    publicId: s.publicId!,
    title: s.title,
    handle: r.handle,
    genre: s.genre,
    genreLabel: findGenre(s.genre)?.label ?? s.genre,
    language: s.language,
    languageLabel: languageLabel(s.language).name,
    mood: s.mood,
    durationSec: s.durationSec,
    ownVoice: Boolean(s.voiceProfileId),
    playCount: s.playCount,
    likeCount: s.likeCount,
    audioUrl: `/api/listen/songs/${s.publicId}/audio`,
    coverUrl: s.coverPath ? `/api/listen/songs/${s.publicId}/cover` : null,
  };
}

export type PublicSongCard = ReturnType<typeof publicSongCard>;

// The song page: the card plus lyrics, counts and what this viewer did.
export async function publicSongView(db: Db, r: PublicRow, viewerId?: string) {
  const s = r.song;
  const mine = viewerId === s.userId;
  const counts = await db
    .select({ kind: songReaction.kind, n: sql<number>`count(*)::int` })
    .from(songReaction)
    .where(eq(songReaction.songId, s.id))
    .groupBy(songReaction.kind);
  const reactions = Object.fromEntries(REACTIONS.map((k) => [k, 0])) as Record<Reaction, number>;
  for (const c of counts) if (c.n >= REACTION_COUNT_FROM) reactions[c.kind] = c.n;
  const [vote] = viewerId ? await db.select({ value: songVote.value }).from(songVote).where(and(eq(songVote.songId, s.id), eq(songVote.userId, viewerId))) : [];
  const [reaction] = viewerId ? await db.select({ kind: songReaction.kind }).from(songReaction).where(and(eq(songReaction.songId, s.id), eq(songReaction.userId, viewerId))) : [];
  // The credit line comes from remix_link (edits and "my voice" versions have a parent too, but aren't remixes).
  const [link] = await db.select({ parentSongId: remixLink.parentSongId }).from(remixLink).where(eq(remixLink.childSongId, s.id));
  const [parent] = link
    ? await db.select(publicColumns).from(song).innerJoin(creatorProfile, eq(creatorProfile.userId, song.userId)).where(and(eq(song.id, link.parentSongId), listed()))
    : [];
  return {
    ...publicSongCard(r),
    state: publicState(s),
    lyrics: s.showLyrics ? s.lyrics : null,
    allowRemix: s.allowRemix && !s.voiceProfileId,
    publishedAt: s.publishedAt?.toISOString() ?? null,
    reactions,
    // "Not for me" is never public; the maker sees their own total (owner decision, 2026-11-06).
    dislikeCount: mine ? s.dislikeCount : null,
    mine,
    myVote: (vote?.value ?? 0) as -1 | 0 | 1,
    myReaction: (reaction?.kind ?? null) as Reaction | null,
    remixOf: parent && parent.song.userId !== s.userId ? { publicId: parent.song.publicId!, title: parent.song.title, handle: parent.handle } : null,
    // "A remix of a song that's no longer public": the parent was deleted, made private or taken down.
    remixOfGone: Boolean(link && !parent),
  };
}

export type PublicSongView = Awaited<ReturnType<typeof publicSongView>>;

// ---------- Rails ----------

const DAY_MS = 86400_000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

async function listedSongs(db: Db, where: SQL | undefined, order: SQL, limit: number): Promise<PublicRow[]> {
  return db
    .select(publicColumns)
    .from(song)
    .innerJoin(creatorProfile, eq(creatorProfile.userId, song.userId))
    .where(and(listed(), where))
    .orderBy(order)
    .limit(limit);
}

// At most `perCreator` songs from one creator, so one busy creator doesn't fill a rail.
export function spreadCreators<T extends { song: Song }>(rows: T[], perCreator: number, limit: number): T[] {
  const seen = new Map<string, number>();
  const out: T[] = [];
  for (const r of rows) {
    const n = seen.get(r.song.userId) ?? 0;
    if (n >= perCreator) continue;
    seen.set(r.song.userId, n + 1);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

// Plays plus three times likes in the last 7 days.
function trendingScore(now: Date) {
  const since = dayKey(new Date(now.getTime() - 6 * DAY_MS));
  const sinceTs = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  return sql<number>`(
    (select count(*) from ${songPlay} where ${songPlay.songId} = ${song.id} and ${songPlay.day} >= ${since})
    + 3 * (select count(*) from ${songVote} where ${songVote.songId} = ${song.id} and ${songVote.value} = 1 and ${songVote.createdAt} >= ${sinceTs}::timestamp)
  )`;
}

export type RailKind = "new" | "trending" | "genre" | "language";

export async function rail(db: Db, kind: RailKind, opts: { lang?: string; genre?: string; limit?: number; now?: Date } = {}): Promise<PublicRow[]> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 12;
  const lang = opts.lang ? eq(song.language, opts.lang) : undefined;
  if (kind === "new") {
    return spreadCreators(await listedSongs(db, and(lang), desc(song.publishedAt), limit * 5), 2, limit);
  }
  if (kind === "trending") {
    const score = trendingScore(now);
    const rows = await db
      .select({ ...publicColumns, score })
      .from(song)
      .innerJoin(creatorProfile, eq(creatorProfile.userId, song.userId))
      .where(and(listed(), lang))
      .orderBy(desc(score), desc(song.publishedAt))
      .limit(limit * 3);
    return spreadCreators(
      rows.filter((r) => Number(r.score) > 0),
      3,
      limit,
    ).map(({ song: s, handle }) => ({ song: s, handle }));
  }
  if (kind === "genre") {
    if (!opts.genre) return [];
    const best = sql`(${song.likeCount} * 3 + ${song.playCount})`;
    return spreadCreators(await listedSongs(db, and(lang, eq(song.genre, opts.genre)), desc(best), limit * 3), 3, limit);
  }
  return opts.lang ? spreadCreators(await listedSongs(db, lang, desc(song.publishedAt), limit * 3), 3, limit) : [];
}

// Everything the Listen screen shows, optionally for one language.
export async function listenHome(db: Db, opts: { lang?: string; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const lang = opts.lang ? eq(song.language, opts.lang) : undefined;
  const genres = await db
    .select({ genre: song.genre, n: sql<number>`count(*)::int` })
    .from(song)
    .where(and(listed(), lang))
    .groupBy(song.genre)
    .orderBy(desc(sql`count(*)`))
    .limit(3);
  const languages = await db
    .select({ language: song.language, n: sql<number>`count(*)::int` })
    .from(song)
    .where(listed())
    .groupBy(song.language)
    .orderBy(desc(sql`count(*)`));
  const [week] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(song)
    .where(and(listed(), lang, gte(song.publishedAt, new Date(now.getTime() - 7 * DAY_MS))));
  const [newRows, trendingRows, ...bestOf] = await Promise.all([
    rail(db, "new", { lang: opts.lang, now }),
    rail(db, "trending", { lang: opts.lang, now }),
    ...genres.map((g) => rail(db, "genre", { genre: g.genre, lang: opts.lang, now })),
  ]);
  return {
    newThisWeek: week?.n ?? 0,
    new: newRows.map(publicSongCard),
    trending: trendingRows.map(publicSongCard),
    bestOf: genres.map((g, i) => ({ genre: g.genre, label: findGenre(g.genre)?.label ?? g.genre, songs: bestOf[i].map(publicSongCard) })).filter((r) => r.songs.length),
    languages: languages.map((l) => ({ code: l.language, ...languageLabel(l.language), count: l.n })),
  };
}

// ---------- Autoplay ----------

export const relatedSchema = z.object({
  seed: z.string().regex(PUBLIC_ID).optional(),
  exclude: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").filter((x) => PUBLIC_ID.test(x)).slice(0, 300) : [])),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

// What Autoplay plays when the queue runs out: songs like the seed (genre, then language, then
// mood, with a little popularity and chance), skipping songs already heard (`exclude`), the
// listener's own songs and ones they marked Not for me. No creator twice in a row.
export async function relatedSongs(db: Db, opts: { seed?: string; exclude?: string[]; viewerId?: string; limit?: number; random?: () => number }): Promise<PublicRow[]> {
  const limit = opts.limit ?? 5;
  const seed = opts.seed ? await publicSong(db, opts.seed) : null;
  const exclude = [...(opts.exclude ?? []), ...(opts.seed ? [opts.seed] : [])];
  const s = seed?.song;
  const score = s
    ? sql<number>`(case when ${song.genre} = ${s.genre} then 4 else 0 end)
        + (case when ${song.language} = ${s.language} then 2 else 0 end)
        + (case when ${song.mood} = ${s.mood} and ${song.mood} <> '' then 1 else 0 end)
        + ln(1 + ${song.playCount} + 3 * ${song.likeCount}) * 0.4`
    : sql<number>`ln(1 + ${song.playCount} + 3 * ${song.likeCount})`;
  const disliked = opts.viewerId
    ? db
        .select({ id: songVote.songId })
        .from(songVote)
        .where(and(eq(songVote.userId, opts.viewerId), eq(songVote.value, -1)))
    : undefined;
  const rows = await db
    .select({ ...publicColumns, score })
    .from(song)
    .innerJoin(creatorProfile, eq(creatorProfile.userId, song.userId))
    .where(
      and(
        listed(),
        exclude.length ? notInArray(song.publicId, exclude) : undefined,
        opts.viewerId ? ne(song.userId, opts.viewerId) : undefined,
        disliked ? notInArray(song.id, disliked) : undefined,
      ),
    )
    .orderBy(desc(score), desc(song.publishedAt))
    .limit(limit * 6);
  // A little chance, so the same seed doesn't always give the same five.
  const random = opts.random ?? Math.random;
  const shuffled = rows.map((r) => ({ r, k: Number(r.score) + random() * 1.5 })).sort((a, b) => b.k - a.k);
  const out: PublicRow[] = [];
  let last = s?.userId;
  const pool = shuffled.map((x) => x.r);
  while (out.length < limit && pool.length) {
    const i = pool.findIndex((r) => r.song.userId !== last);
    const [pick] = pool.splice(i === -1 ? 0 : i, 1);
    out.push({ song: pick.song, handle: pick.handle });
    last = pick.song.userId;
  }
  return out;
}

// The song page's two rails.
export async function songRails(db: Db, r: PublicRow, viewerId?: string) {
  const more = await relatedSongs(db, { seed: r.song.publicId!, viewerId, limit: 8, random: () => 0 });
  const byCreator = await listedSongs(db, and(eq(song.userId, r.song.userId), ne(song.id, r.song.id)), desc(song.publishedAt), 8);
  return { moreLikeThis: more.map(publicSongCard), byCreator: byCreator.map(publicSongCard) };
}

// ---------- Plays, votes, reactions, reports ----------

// One play per listener per song per day; the maker's own plays don't count. Returns whether it counted.
export async function countSongPlay(db: Db, s: Song, listener: string, now = new Date()): Promise<boolean> {
  if (listener === s.userId) return false;
  return db.transaction(async (tx) => {
    const inserted = await tx.insert(songPlay).values({ songId: s.id, listener, day: dayKey(now) }).onConflictDoNothing().returning();
    if (!inserted.length) return false;
    await tx
      .update(song)
      .set({ playCount: sql`${song.playCount} + 1` })
      .where(eq(song.id, s.id));
    return true;
  });
}

// Like (1), Not for me (-1) or neither (0). Counters move with the change.
export async function voteSong(db: Db, s: Song, userId: string, value: -1 | 0 | 1): Promise<void> {
  await db.transaction(async (tx) => {
    const [old] = await tx.select({ value: songVote.value }).from(songVote).where(and(eq(songVote.songId, s.id), eq(songVote.userId, userId)));
    const before = old?.value ?? 0;
    if (before === value) return;
    if (value === 0) await tx.delete(songVote).where(and(eq(songVote.songId, s.id), eq(songVote.userId, userId)));
    else
      await tx
        .insert(songVote)
        .values({ songId: s.id, userId, value })
        .onConflictDoUpdate({ target: [songVote.songId, songVote.userId], set: { value, createdAt: new Date() } });
    const like = (value === 1 ? 1 : 0) - (before === 1 ? 1 : 0);
    const dislike = (value === -1 ? 1 : 0) - (before === -1 ? 1 : 0);
    await tx
      .update(song)
      .set({ likeCount: sql`${song.likeCount} + ${like}`, dislikeCount: sql`${song.dislikeCount} + ${dislike}` })
      .where(eq(song.id, s.id));
  });
}

export async function reactToSong(db: Db, s: Song, userId: string, kind: Reaction | null): Promise<void> {
  if (!kind) {
    await db.delete(songReaction).where(and(eq(songReaction.songId, s.id), eq(songReaction.userId, userId)));
    return;
  }
  await db
    .insert(songReaction)
    .values({ songId: s.id, userId, kind })
    .onConflictDoUpdate({ target: [songReaction.songId, songReaction.userId], set: { kind, createdAt: new Date() } });
}

export const voteSchema = z.object({ value: z.union([z.literal(-1), z.literal(0), z.literal(1)]) });
export const reactionSchema = z.object({ kind: z.enum(REACTIONS).nullable() });

export const songReportSchema = z.object({
  reason: z.enum(giftReportReason.enumValues),
  details: z.string().trim().max(500).default(""),
  email: z.string().trim().email().max(200).optional().or(z.literal("").transform(() => undefined)),
});

export async function saveSongReport(db: Db, songId: string, r: z.infer<typeof songReportSchema>, reporterId?: string): Promise<void> {
  await db.insert(songReport).values({ songId, reason: r.reason, details: r.details, email: r.email ?? null, reporterId: reporterId ?? null });
}

// For the maker's own song in Song Studio: whether it's on Listen and how it's doing.
export function ownListenView(baseUrl: string, s: Song) {
  return {
    state: publicState(s),
    publicId: s.publicId,
    url: s.publicId ? `${baseUrl}/s/${s.publicId}` : null,
    showLyrics: s.showLyrics,
    allowRemix: s.allowRemix,
    playCount: s.playCount,
    likeCount: s.likeCount,
    dislikeCount: s.dislikeCount,
  };
}
