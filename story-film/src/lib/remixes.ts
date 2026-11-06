import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { creatorEarning, creatorProfile, profileAvatar, remixLink, song } from "@/lib/db/schema";
import { EARN_RATE_BP } from "@/lib/billing/catalog";
import { dropEarning, settleEarning, type SubjectInfo } from "@/lib/billing/earnings";
import { listed, PUBLIC_ID, publicColumns, publicState, type PublicRow } from "@/lib/listen";
import { songVisibleTo, viewerHides, type ViewerHides } from "@/lib/moderation";
import { EXTEND_SEC, MAX_REMIXED_SEC, openRemixKinds, remixKindList, type RemixKind } from "@/lib/songs/remix";
import type { Song } from "@/lib/songs/songs";

// Remix chains with credit (design/community/remix-spec.md): who a remix came from, its family
// tree, what others may make of a public song, and the Inbox items for the maker. Earnings use the
// shared model in src/lib/billing/earnings.ts (source "remix").

export type RemixLink = typeof remixLink.$inferSelect;

// ---------- Links ----------

export async function linkOf(db: Db, songId: string): Promise<RemixLink | undefined> {
  const [row] = await db.select().from(remixLink).where(eq(remixLink.childSongId, songId));
  return row;
}

// Written for every remix, own songs too: the parent's root (or the parent) and one level deeper.
export async function linkRemix(db: Db, child: string, parent: Song, kind: RemixKind): Promise<RemixLink> {
  const up = await linkOf(db, parent.id);
  const [row] = await db
    .insert(remixLink)
    .values({ childSongId: child, parentSongId: parent.id, parentUserId: parent.userId, rootSongId: up?.rootSongId ?? parent.id, depth: (up?.depth ?? 0) + 1, kind })
    .returning();
  return row;
}

// ---------- What others may make of a song ----------

export type RemixBlock = "mine" | "off" | "ownVoice" | "tooLong" | "notPublic";

// Why this viewer can't remix this song from its public page, or null when they can.
export function remixBlocked(s: Song, viewerId?: string): RemixBlock | null {
  if (viewerId && s.userId === viewerId) return "mine";
  if (publicState(s) !== "public") return "notPublic";
  if (s.voiceProfileId) return "ownVoice";
  if (!s.allowRemix) return "off";
  if (s.durationSec > MAX_REMIXED_SEC) return "tooLong";
  return null;
}

export const REMIX_BLOCKED_TEXT: Record<Exclude<RemixBlock, "mine">, string> = {
  off: "This song's maker has turned off remixes for it.",
  ownVoice: "This song is sung in its maker's own voice, so it can't be remixed.",
  tooLong: "This song is longer than 4 minutes, so it can't be remixed.",
  notPublic: "This song isn't public any more.",
};

// The kinds with prices for someone else's song. Extend is listed but unavailable when even the
// shortest extension would pass the limit.
export function openKindList(s: Song, proAvailable: boolean) {
  const open = openRemixKinds(proAvailable);
  return remixKindList(proAvailable)
    .filter((k) => open.includes(k.kind))
    .map((k) => (k.kind === "extend" && s.durationSec + 15 > MAX_REMIXED_SEC ? { ...k, unavailable: "Too long to extend" } : k));
}

// ---------- Family ----------

// A song in a chain as the public sees it. A "gone" node (deleted, private or taken down) has no
// title, handle or link, so nothing private shows.
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

type Row = { song: Song; handle: string | null };

// Songs by someone the viewer blocked, or that they reported, show as gone nodes for them.
const hiddenFor = (r: Row | undefined, hide?: ViewerHides) => Boolean(r && hide && (hide.users.has(r.song.userId) || hide.songs.has(r.song.id)));

function node(r: Row | undefined, kind: RemixKind | null, depth: number, remixCount = 0, hide?: ViewerHides): FamilyNode {
  const open = r && r.handle && publicState(r.song) === "public" && !hiddenFor(r, hide);
  if (!open) return { publicId: null, title: null, handle: null, coverUrl: null, kind, depth, playCount: 0, remixCount, gone: true };
  const s = r.song;
  return { publicId: s.publicId, title: s.title, handle: r.handle, coverUrl: s.coverPath ? `/api/listen/songs/${s.publicId}/cover` : null, kind, depth, playCount: s.playCount, remixCount, gone: false };
}

async function rowsFor(db: Db, ids: string[]): Promise<Map<string, Row>> {
  if (!ids.length) return new Map();
  const rows = await db.select({ song, handle: creatorProfile.handle }).from(song).leftJoin(creatorProfile, eq(creatorProfile.userId, song.userId)).where(inArray(song.id, ids));
  return new Map(rows.map((r) => [r.song.id, r]));
}

// Public direct remixes of each song.
async function publicRemixCounts(db: Db, ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select({ parent: remixLink.parentSongId, n: sql<number>`count(*)::int` })
    .from(remixLink)
    .innerJoin(song, eq(song.id, remixLink.childSongId))
    .where(and(inArray(remixLink.parentSongId, ids), listed()))
    .groupBy(remixLink.parentSongId);
  return new Map(rows.map((r) => [r.parent, Number(r.n)]));
}

const MAX_CHAIN = 100;

// Where it came from, oldest first: the original down to the direct parent. With more than 3 above
// this song, only the original and the parent are listed and `more` counts the ones between.
export async function familyPath(db: Db, songId: string, hide?: ViewerHides): Promise<{ path: FamilyNode[]; more: number }> {
  const chain: RemixLink[] = [];
  let at = await linkOf(db, songId);
  while (at && chain.length < MAX_CHAIN) {
    chain.push(at);
    at = await linkOf(db, at.parentSongId);
  }
  if (!chain.length) return { path: [], more: 0 };
  // chain[0] links this song to its parent; the last one's parent is the original.
  const ids = chain.map((l) => l.parentSongId);
  const rows = await rowsFor(db, ids);
  const kindOf = (i: number) => (i + 1 < chain.length ? chain[i + 1].kind : null);
  const all = chain.map((l, i) => node(rows.get(l.parentSongId), kindOf(i), l.depth - 1, 0, hide)).reverse();
  if (all.length <= 3) return { path: all, more: 0 };
  return { path: [all[0], all[all.length - 1]], more: all.length - 2 };
}

export type FamilySort = "top" | "new";
const score = (r: Row | undefined) => (r ? r.song.playCount + r.song.likeCount : -1);

// The top public remixes of one song, for its Remixes section.
export async function topRemixes(db: Db, songId: string, limit = 3, viewerId?: string): Promise<FamilyNode[]> {
  const rows = await db
    .select({ ...publicColumns, kind: remixLink.kind, depth: remixLink.depth })
    .from(remixLink)
    .innerJoin(song, eq(song.id, remixLink.childSongId))
    .innerJoin(creatorProfile, eq(creatorProfile.userId, song.userId))
    .leftJoin(profileAvatar, eq(profileAvatar.userId, song.userId))
    .where(and(eq(remixLink.parentSongId, songId), listed(), songVisibleTo(viewerId)))
    .orderBy(desc(sql`${song.playCount} + ${song.likeCount}`), desc(song.publishedAt))
    .limit(limit);
  const counts = await publicRemixCounts(db, rows.map((r) => r.song.id));
  return rows.map((r) => node(r, r.kind, r.depth, counts.get(r.song.id) ?? 0));
}

// Every public song in the family, the original included.
export async function familySize(db: Db, rootId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(song)
    .where(and(listed(), sql`(${song.id} = ${rootId} or ${song.id} in (select ${remixLink.childSongId} from ${remixLink} where ${remixLink.rootSongId} = ${rootId}))`));
  return Number(row?.n ?? 0);
}

export interface FamilyRow extends FamilyNode {
  // Stable within one response: the public id, or "gone-{n}".
  key: string;
  level: number;
  // Children not shown under this row ("Show 8 more").
  more: number;
  current: boolean;
}

const FIRST_CHILDREN = 3;
export const BRANCH_PAGE = 20;

// The whole family as an outline: the original first, each remix under the song it came from.
// Private leaves are left out; a hidden song with public remixes under it is a gone node. Each
// song shows its first 3 remixes (by `sort`); `branch` (a public id) shows that one's remixes 20 at
// a time from `offset`. A remix whose parent was deleted hangs under the original as a gone node.
export async function familyTree(db: Db, of: Song, opts: { sort?: FamilySort; branch?: string; offset?: number; viewerId?: string } = {}) {
  const sort = opts.sort ?? "top";
  const hide = await viewerHides(db, opts.viewerId);
  const rootId = (await linkOf(db, of.id))?.rootSongId ?? of.id;
  const links = await db.select().from(remixLink).where(eq(remixLink.rootSongId, rootId)).limit(5000);
  const rows = await rowsFor(db, [rootId, ...links.map((l) => l.childSongId)]);
  const known = new Set([rootId, ...links.map((l) => l.childSongId)]);
  const children = new Map<string, RemixLink[]>();
  const kindOf = new Map<string, RemixKind>();
  const add = (parent: string, l: RemixLink) => children.set(parent, [...(children.get(parent) ?? []), l]);
  // A deleted song in the middle: its remixes point at an id with no row, so it becomes a gone node under the original.
  for (const l of links) {
    kindOf.set(l.childSongId, l.kind);
    if (!known.has(l.parentSongId)) {
      add(rootId, { ...l, childSongId: l.parentSongId, parentSongId: rootId, depth: l.depth - 1 });
      known.add(l.parentSongId);
    }
    add(l.parentSongId, l);
  }
  const isPublic = (id: string) => {
    const r = rows.get(id);
    return Boolean(r?.handle) && publicState(r!.song) === "public" && !hiddenFor(r, hide);
  };
  const visible = new Map<string, boolean>();
  const shows = (id: string, seen = 0): boolean => {
    if (visible.has(id)) return visible.get(id)!;
    const v = isPublic(id) || (seen < MAX_CHAIN && (children.get(id) ?? []).some((c) => shows(c.childSongId, seen + 1)));
    visible.set(id, v);
    return v;
  };
  const order = (list: RemixLink[]) =>
    list
      .filter((l) => shows(l.childSongId))
      .sort((a, b) => (sort === "new" ? b.createdAt.getTime() - a.createdAt.getTime() : score(rows.get(b.childSongId)) - score(rows.get(a.childSongId)) || b.createdAt.getTime() - a.createdAt.getTime()));
  const out: FamilyRow[] = [];
  let gone = 0;
  const walk = (id: string, kind: RemixKind | null, level: number) => {
    if (level > MAX_CHAIN) return;
    const kids = order(children.get(id) ?? []);
    const n = node(rows.get(id), kind, level, kids.filter((k) => isPublic(k.childSongId)).length, hide);
    const open = n.publicId !== null && n.publicId === opts.branch;
    const from = open ? (opts.offset ?? 0) : 0;
    const shown = kids.slice(from, from + (open ? BRANCH_PAGE : FIRST_CHILDREN));
    out.push({ ...n, key: n.publicId ?? `gone-${gone++}`, level, more: kids.length - from - shown.length, current: id === of.id });
    for (const k of shown) walk(k.childSongId, kindOf.get(k.childSongId) ?? k.kind, level + 1);
  };
  walk(rootId, null, 0);
  const root = rows.get(rootId);
  return { size: await familySize(db, rootId), rootTitle: root && isPublic(rootId) ? root.song.title : null, sort, rows: out };
}

// The song page's Remixes section, its Remix button, and the maker's own numbers.
export async function songFamily(db: Db, r: PublicRow, viewerId: string | undefined, proAvailable: boolean) {
  const s = r.song;
  const link = await linkOf(db, s.id);
  const hide = await viewerHides(db, viewerId);
  const [{ path, more }, top, counts, size] = await Promise.all([familyPath(db, s.id, hide), topRemixes(db, s.id, 3, viewerId), publicRemixCounts(db, [s.id]), familySize(db, link?.rootSongId ?? s.id)]);
  const blocked = remixBlocked(s, viewerId);
  const mine = viewerId === s.userId ? await ownRemixStats(db, s) : null;
  return {
    family: { path, more, remixCount: counts.get(s.id) ?? 0, familySize: size, top, allowRemix: s.allowRemix && !s.voiceProfileId, mine },
    remix: { kinds: blocked ? [] : openKindList(s, proAvailable), blocked },
    earnRateBp: EARN_RATE_BP,
  };
}

// For the maker: every remix of this song (private ones counted without names), how many are
// public, and what it earned.
export async function ownRemixStats(db: Db, s: Song) {
  const [row] = await db
    .select({
      all: sql<number>`count(*)::int`,
      published: sql<number>`count(*) filter (where ${listed()})::int`,
    })
    .from(remixLink)
    .innerJoin(song, eq(song.id, remixLink.childSongId))
    .where(and(eq(remixLink.parentSongId, s.id), eq(song.status, "completed"), sql`${song.userId} <> ${s.userId}`));
  const [earned] = await db
    .select({ h: sql<number>`coalesce(sum(${creatorEarning.hundredths}), 0)::int` })
    .from(creatorEarning)
    .where(and(eq(creatorEarning.userId, s.userId), eq(creatorEarning.source, "remix"), eq(creatorEarning.subjectRef, s.id), eq(creatorEarning.status, "earned")));
  return { remixes: Number(row?.all ?? 0), published: Number(row?.published ?? 0), earnedHundredths: Number(earned?.h ?? 0) };
}

// The maker's Allow remixes switch on their song page (no publish checks to run again). `id` is the
// song's id, or its public id (the song page has only that).
export async function setAllowRemix(db: Db, userId: string, id: string, allow: boolean): Promise<Song | undefined> {
  const [row] = await db
    .update(song)
    .set({ allowRemix: allow })
    .where(and(PUBLIC_ID.test(id) ? eq(song.publicId, id) : eq(song.id, id), eq(song.userId, userId)))
    .returning();
  return row;
}

// The remixer's own song in Song Studio: the credit line it carries, locked ("A remix of X by @y"),
// or that the parent isn't public now.
export async function ownRemixOf(db: Db, s: Song) {
  const link = await linkOf(db, s.id);
  if (!link || link.parentUserId === s.userId) return null;
  const parent = (await rowsFor(db, [link.parentSongId])).get(link.parentSongId);
  const n = node(parent, link.kind, link.depth - 1);
  return n.gone ? { gone: true as const, kind: link.kind } : { gone: false as const, kind: link.kind, publicId: n.publicId!, title: n.title!, handle: n.handle! };
}

// ---------- The worker ----------

// A remix finished: its earning counts, unless the parent was taken down meanwhile (a report was
// upheld). Made private only still earns. Returns the settled earning, if there was one.
export async function remixFinished(db: Db, songId: string) {
  const link = await linkOf(db, songId);
  if (!link) return null;
  const [parent] = await db.select({ takenDownAt: song.takenDownAt }).from(song).where(eq(song.id, link.parentSongId));
  if (parent?.takenDownAt) {
    await dropEarning(db, "remix", songId);
    return null;
  }
  return settleEarning(db, "remix", songId);
}

// ---------- Earnings screen and Inbox ----------

// Titles and covers of the creator's own songs for the Earnings list (DescribeSubjects for "remix").
export async function remixSubjects(db: Db, refs: string[]): Promise<Map<string, SubjectInfo>> {
  const rows = await rowsFor(db, refs);
  return new Map(
    [...rows.values()].map((r) => {
      const pub = publicState(r.song) === "public" ? r.song.publicId : null;
      return [r.song.id, { title: r.song.title, coverUrl: r.song.coverPath ? `/api/songs/${r.song.id}/cover` : null, publicId: pub }];
    }),
  );
}

// What each remix was and who made it, named only when the remix is public.
export async function remixDetails(db: Db, childIds: string[]): Promise<Map<string, { kind: RemixKind; remixerHandle: string | null; publicId: string | null }>> {
  if (!childIds.length) return new Map();
  const rows = await db
    .select({ id: remixLink.childSongId, kind: remixLink.kind, song, handle: creatorProfile.handle })
    .from(remixLink)
    .innerJoin(song, eq(song.id, remixLink.childSongId))
    .leftJoin(creatorProfile, eq(creatorProfile.userId, song.userId))
    .where(inArray(remixLink.childSongId, childIds));
  return new Map(
    rows.map((r) => {
      const pub = publicState(r.song) === "public" && r.handle;
      return [r.id, { kind: r.kind, remixerHandle: pub ? r.handle : null, publicId: pub ? r.song.publicId : null }];
    }),
  );
}

export interface RemixInboxItem {
  // published: named, opens the remix; private: "Someone made a cover"; batch: "5 new remixes of X".
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

const DAY_MS = 86400_000;
// More than this many remixes of one song in one day become one Inbox row.
const BATCH_FROM = 3;

// The Inbox's Remixes group: finished remixes of the creator's songs by others in the last 30 days.
// A public remix is named; a private one is "Someone". More than 3 of one song in a day are batched.
export async function remixInbox(db: Db, userId: string, now = new Date()) {
  const rows = await db
    .select({ link: remixLink, song, handle: creatorProfile.handle, hundredths: creatorEarning.hundredths })
    .from(remixLink)
    .innerJoin(song, eq(song.id, remixLink.childSongId))
    .leftJoin(creatorProfile, eq(creatorProfile.userId, song.userId))
    .leftJoin(creatorEarning, and(eq(creatorEarning.source, "remix"), eq(creatorEarning.sourceRef, sql`${remixLink.childSongId}::text`), eq(creatorEarning.status, "earned")))
    .where(and(eq(remixLink.parentUserId, userId), eq(song.status, "completed"), sql`${song.userId} <> ${userId}`, gte(remixLink.createdAt, new Date(now.getTime() - 30 * DAY_MS))))
    .orderBy(desc(song.completedAt))
    .limit(200);
  const parents = await rowsFor(db, [...new Set(rows.map((r) => r.link.parentSongId))]);
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${r.link.parentSongId}:${(r.song.completedAt ?? r.link.createdAt).toISOString().slice(0, 10)}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const items = [...groups.values()].flatMap((g): RemixInboxItem[] => {
    const parent = parents.get(g[0].link.parentSongId);
    const base = { subjectRef: g[0].link.parentSongId, songTitle: parent?.song.title ?? "your song" };
    if (g.length > BATCH_FROM) {
      return [{ ...base, kind: "batch", count: g.length, remixKind: null, remixerHandle: null, publicId: null, at: (g[0].song.completedAt ?? g[0].link.createdAt).toISOString(), hundredths: g.reduce((n, r) => n + (r.hundredths ?? 0), 0) }];
    }
    return g.map((r) => {
      const pub = publicState(r.song) === "public" && r.handle;
      return { ...base, kind: pub ? "published" : "private", count: 1, remixKind: r.link.kind, remixerHandle: pub ? r.handle : null, publicId: pub ? r.song.publicId : null, at: (r.song.completedAt ?? r.link.createdAt).toISOString(), hundredths: r.hundredths ?? 0 };
    });
  });
  return items.slice(0, 50);
}

export type SongFamily = Awaited<ReturnType<typeof songFamily>>;
export type FamilyTree = Awaited<ReturnType<typeof familyTree>>;
