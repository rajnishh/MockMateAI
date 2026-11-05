import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { song as songTable, user } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  countSongPlay,
  handleProblem,
  listenHome,
  ownListenView,
  PUBLIC_ID,
  publicSong,
  publicSongView,
  publishSong,
  rail,
  reactToSong,
  relatedSongs,
  saveSongReport,
  setHandle,
  songRails,
  spreadCreators,
  suggestHandles,
  unpublishSong,
  voteSong,
} from "@/lib/listen";
import { createSong, getSongById, type Song } from "@/lib/songs/songs";
import { testDb } from "./helpers/db";

const PEOPLE = ["rajnish", "priya", "imran", "listener"];

async function setup(): Promise<Db> {
  const db = await testDb();
  const now = new Date();
  await db.insert(user).values(PEOPLE.map((id) => ({ id, name: id === "priya" ? "Priya Sharma" : "Creator 1234", email: `${id}@example.com`, createdAt: now, updatedAt: now })));
  return db;
}

const ok = async () => undefined;

async function make(db: Db, userId: string, extra: Partial<typeof songTable.$inferInsert> = {}): Promise<Song> {
  return createSong(db, {
    userId,
    title: "Chai pe charcha",
    genre: "pop",
    mood: "happy",
    language: "hi",
    lyrics: "[Verse]\nChai ki pyali\n\n[Chorus]\nGaram garam",
    durationSec: 90,
    status: "completed",
    outputPath: "/tmp/song.mp3",
    ...extra,
  });
}

// Publishes a new song by `userId` (giving them a handle first) and returns it.
async function published(db: Db, userId: string, extra: Partial<typeof songTable.$inferInsert> = {}, when?: Date): Promise<Song> {
  await setHandle(db, userId, `${userId}.music`);
  const s = await make(db, userId, extra);
  const r = await publishSong(db, userId, s.id, { showLyrics: true, allowRemix: true }, ok, when);
  if (!("song" in r)) throw new Error(r.error);
  return r.song;
}

describe("handles", () => {
  it("accepts simple lowercase handles and explains the rest", () => {
    expect(handleProblem("priya.sings")).toBeNull();
    expect(handleProblem("ab")).toMatch(/at least 3/);
    expect(handleProblem("Priya Sharma")).toMatch(/letters a-z/);
    expect(handleProblem(".priya")).toMatch(/Start and end/);
    expect(handleProblem("pri..ya")).toMatch(/Start and end/);
    expect(handleProblem("reelkar_official")).toMatch(/reserved/);
    expect(handleProblem("admin")).toMatch(/reserved/);
  });

  it("saves one handle per person, lowercase, and refuses taken ones", async () => {
    const db = await setup();
    expect(await setHandle(db, "priya", "@Priya.Sings")).toEqual({ handle: "priya.sings" });
    expect(await setHandle(db, "rajnish", "priya.sings")).toMatchObject({ status: 409 });
  });

  it("lets a handle change only every 30 days", async () => {
    const db = await setup();
    const t0 = new Date("2026-11-01T00:00:00Z");
    await setHandle(db, "priya", "priya.one", t0);
    expect(await setHandle(db, "priya", "priya.two", new Date("2026-11-10T00:00:00Z"))).toMatchObject({ status: 400, error: expect.stringMatching(/2026-12-01/) });
    expect(await setHandle(db, "priya", "priya.two", new Date("2026-12-02T00:00:00Z"))).toEqual({ handle: "priya.two" });
  });

  it("suggests free handles from the name, never from a placeholder name", async () => {
    const db = await setup();
    await setHandle(db, "rajnish", "priyasharma");
    const ideas = await suggestHandles(db, "Priya Sharma");
    expect(ideas).not.toContain("priyasharma");
    expect(ideas[0]).toBe("priya.sharma");
    expect((await suggestHandles(db, "Creator 1234"))[0]).toMatch(/^creator/);
  });
});

describe("publishing", () => {
  it("needs a handle, then makes a public link that survives unpublish and re-publish", async () => {
    const db = await setup();
    const s = await make(db, "priya");
    expect(await publishSong(db, "priya", s.id, { showLyrics: true, allowRemix: true }, ok)).toMatchObject({ status: 400, needHandle: true });
    await setHandle(db, "priya", "priya.sings");
    const r = await publishSong(db, "priya", s.id, { title: "Chai time", showLyrics: false, allowRemix: false }, ok);
    if (!("song" in r)) throw new Error(r.error);
    expect(r.song.publicId).toMatch(PUBLIC_ID);
    expect(r.song).toMatchObject({ title: "Chai time", showLyrics: false, allowRemix: false });
    const link = r.song.publicId;

    await unpublishSong(db, "priya", s.id);
    const found = await publicSong(db, link!);
    expect(found && (await publicSongView(db, found)).state).toBe("private");
    const again = await publishSong(db, "priya", s.id, { showLyrics: true, allowRemix: true }, ok);
    expect("song" in again && again.song.publicId).toBe(link);
    expect(ownListenView("https://reelkar.app", (await getSongById(db, s.id))!)).toMatchObject({ state: "public", url: `https://reelkar.app/s/${link}` });
  });

  it("only publishes the maker's own finished songs", async () => {
    const db = await setup();
    await setHandle(db, "rajnish", "rajnish.music");
    const theirs = await make(db, "priya");
    expect(await publishSong(db, "rajnish", theirs.id, { showLyrics: true, allowRemix: true }, ok)).toMatchObject({ status: 404 });
    const making = await make(db, "rajnish", { status: "running", outputPath: null });
    expect(await publishSong(db, "rajnish", making.id, { showLyrics: true, allowRemix: true }, ok)).toMatchObject({ status: 400 });
  });

  it("runs the safety check on the title and lyrics, and stays private if it fails", async () => {
    const db = await setup();
    await setHandle(db, "priya", "priya.sings");
    const s = await make(db, "priya");
    const seen: string[][] = [];
    const refuse = async (texts: string[]) => {
      seen.push(texts);
      throw new Error("Songs can't name real singers");
    };
    await expect(publishSong(db, "priya", s.id, { title: "Like a famous singer", showLyrics: true, allowRemix: true }, refuse)).rejects.toThrow(/real singers/);
    expect(seen[0]).toEqual(["Like a famous singer", s.lyrics]);
    expect((await getSongById(db, s.id))!.publishedAt).toBeNull();
  });

  it("can't publish a song that was taken down after a report", async () => {
    const db = await setup();
    const s = await published(db, "priya");
    await db.update(songTable).set({ takenDownAt: new Date() }).where(eq(songTable.id, s.id));
    expect(await publishSong(db, "priya", s.id, { showLyrics: true, allowRemix: true }, ok)).toMatchObject({ status: 403 });
    expect((await publicSongView(db, (await publicSong(db, s.publicId!))!)).state).toBe("taken_down");
  });
});

describe("the song page", () => {
  it("shows public details, hides lyrics when asked, and never shows dislikes to others", async () => {
    const db = await setup();
    const s = await published(db, "priya", { voiceProfileId: null });
    await db.update(songTable).set({ showLyrics: false }).where(eq(songTable.id, s.id));
    await voteSong(db, s, "listener", -1);
    const row = (await publicSong(db, s.publicId!))!;
    const theirs = await publicSongView(db, row, "listener");
    expect(theirs).toMatchObject({ handle: "priya.music", title: "Chai pe charcha", genreLabel: "Pop", languageLabel: "Hindi", lyrics: null, dislikeCount: null, myVote: -1, mine: false });
    expect(theirs.audioUrl).toBe(`/api/listen/songs/${s.publicId}/audio`);
    expect(JSON.stringify(theirs)).not.toContain(s.id);
    expect((await publicSongView(db, row, "priya")).dislikeCount).toBe(1);
  });

  it("shows a reaction's count only once it has 3", async () => {
    const db = await setup();
    const s = await published(db, "priya");
    await reactToSong(db, s, "rajnish", "fire");
    await reactToSong(db, s, "imran", "fire");
    const row = (await publicSong(db, s.publicId!))!;
    expect((await publicSongView(db, row)).reactions.fire).toBe(0);
    await reactToSong(db, s, "listener", "fire");
    expect((await publicSongView(db, row, "listener")).reactions.fire).toBe(3);
    // One reaction each: changing it moves it.
    await reactToSong(db, s, "listener", "dance");
    const v = await publicSongView(db, row, "listener");
    expect(v.reactions.fire).toBe(0);
    expect(v.myReaction).toBe("dance");
    await reactToSong(db, s, "listener", null);
    expect((await publicSongView(db, row, "listener")).myReaction).toBeNull();
  });

  it("links a remix to the public original", async () => {
    const db = await setup();
    const original = await published(db, "priya");
    const remix = await published(db, "rajnish", { parentSongId: original.id, title: "Chai pe charcha (cover)" });
    const v = await publicSongView(db, (await publicSong(db, remix.publicId!))!);
    expect(v.remixOf).toEqual({ publicId: original.publicId, title: "Chai pe charcha", handle: "priya.music" });
  });

  it("has More like this and By this creator rails", async () => {
    const db = await setup();
    const s = await published(db, "priya");
    const other = await published(db, "priya", { title: "Another one", genre: "edm" });
    const like = await published(db, "rajnish");
    const rails = await songRails(db, (await publicSong(db, s.publicId!))!);
    expect(rails.byCreator.map((c) => c.publicId)).toEqual([other.publicId]);
    expect(rails.moreLikeThis[0].publicId).toBe(like.publicId);
  });

  it("saves reports for a person to review", async () => {
    const db = await setup();
    const s = await published(db, "priya");
    await saveSongReport(db, s.id, { reason: "copyright", details: "My lyrics" }, "listener");
    const rows = await db.query.songReport.findMany();
    expect(rows).toMatchObject([{ songId: s.id, reason: "copyright", reporterId: "listener" }]);
    // A report never hides a song by itself (owner decision, 2026-11-06).
    expect((await publicSongView(db, (await publicSong(db, s.publicId!))!)).state).toBe("public");
  });
});

describe("plays and votes", () => {
  it("counts one play per listener per song per day, never the maker's", async () => {
    const db = await setup();
    const s = await published(db, "priya");
    const day1 = new Date("2026-11-06T08:00:00Z");
    expect(await countSongPlay(db, s, "listener", day1)).toBe(true);
    expect(await countSongPlay(db, s, "listener", new Date("2026-11-06T20:00:00Z"))).toBe(false);
    expect(await countSongPlay(db, s, "v:browser-1", day1)).toBe(true);
    expect(await countSongPlay(db, s, "priya", day1)).toBe(false);
    expect(await countSongPlay(db, s, "listener", new Date("2026-11-07T08:00:00Z"))).toBe(true);
    expect((await getSongById(db, s.id))!.playCount).toBe(3);
  });

  it("keeps like and dislike counters in step with each person's one vote", async () => {
    const db = await setup();
    const s = await published(db, "priya");
    await voteSong(db, s, "listener", 1);
    await voteSong(db, s, "listener", 1);
    await voteSong(db, s, "rajnish", 1);
    expect((await getSongById(db, s.id))!).toMatchObject({ likeCount: 2, dislikeCount: 0 });
    await voteSong(db, s, "listener", -1);
    expect((await getSongById(db, s.id))!).toMatchObject({ likeCount: 1, dislikeCount: 1 });
    await voteSong(db, s, "listener", 0);
    expect((await getSongById(db, s.id))!).toMatchObject({ likeCount: 1, dislikeCount: 0 });
  });
});

describe("Listen rails", () => {
  it("lists only public songs, newest first, at most 2 per creator in New", async () => {
    const db = await setup();
    const base = Date.parse("2026-11-01T00:00:00Z");
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) ids.push((await published(db, "priya", { title: `P${i}` }, new Date(base + i * 3600_000))).publicId!);
    const r = await published(db, "rajnish", { title: "R" }, new Date(base + 10 * 3600_000));
    await make(db, "imran"); // private
    const rows = await rail(db, "new");
    expect(rows.map((x) => x.song.publicId)).toEqual([r.publicId, ids[3], ids[2]]);
  });

  it("ranks Trending by plays and likes in the last 7 days", async () => {
    const db = await setup();
    const now = new Date("2026-11-06T12:00:00Z");
    const a = await published(db, "priya", { title: "A" });
    const b = await published(db, "rajnish", { title: "B" });
    const c = await published(db, "imran", { title: "C" });
    await countSongPlay(db, a, "listener", now);
    await countSongPlay(db, a, "v:1", now);
    await voteSong(db, b, "listener", 1); // 3 points
    // Old plays don't count this week.
    for (let i = 0; i < 5; i++) await countSongPlay(db, c, `v:${i}`, new Date("2026-10-01T00:00:00Z"));
    const rows = await rail(db, "trending", { now });
    expect(rows.map((x) => x.song.title)).toEqual(["B", "A"]);
  });

  it("builds the Listen home with Best of genre rails and languages", async () => {
    const db = await setup();
    await published(db, "priya", { genre: "bhangra", language: "pa" });
    await published(db, "rajnish", { genre: "bhangra", language: "hi" });
    await published(db, "imran", { genre: "khaleeji", language: "ar" });
    const home = await listenHome(db, { now: new Date() });
    expect(home.newThisWeek).toBe(3);
    expect(home.new).toHaveLength(3);
    expect(home.bestOf[0]).toMatchObject({ genre: "bhangra", label: "Bhangra" });
    expect(home.languages.map((l) => l.native)).toEqual(expect.arrayContaining(["ਪੰਜਾਬੀ", "हिन्दी", "العربية"]));
    const arabic = await listenHome(db, { lang: "ar", now: new Date() });
    expect(arabic.new.map((s) => s.handle)).toEqual(["imran.music"]);
  });

  it("spreads creators out", () => {
    const rows = ["a", "a", "a", "b"].map((userId, i) => ({ song: { userId, id: String(i) } as Song }));
    expect(spreadCreators(rows, 2, 10).map((r) => r.song.id)).toEqual(["0", "1", "3"]);
  });
});

describe("Autoplay picks", () => {
  it("prefers the same genre, then language, skips heard, own and disliked songs, and alternates creators", async () => {
    const db = await setup();
    const seed = await published(db, "priya", { genre: "bhangra", language: "pa", mood: "energetic" });
    const sameGenre = await published(db, "rajnish", { genre: "bhangra", language: "hi" });
    const sameGenre2 = await published(db, "rajnish", { genre: "bhangra", language: "pa" });
    const sameLang = await published(db, "imran", { genre: "sufi", language: "pa" });
    const heard = await published(db, "imran", { genre: "bhangra", language: "pa", mood: "energetic" });
    const own = await published(db, "listener", { genre: "bhangra", language: "pa" });
    const disliked = await published(db, "imran", { genre: "bhangra", language: "pa", title: "Nope" });
    await voteSong(db, disliked, "listener", -1);

    const picks = await relatedSongs(db, { seed: seed.publicId!, exclude: [heard.publicId!], viewerId: "listener", limit: 3, random: () => 0 });
    const ids = picks.map((p) => p.song.publicId);
    expect(ids).not.toContain(seed.publicId);
    expect(ids).not.toContain(heard.publicId);
    expect(ids).not.toContain(own.publicId);
    expect(ids).not.toContain(disliked.publicId);
    // Bhangra in Punjabi first, then not the same creator twice in a row.
    expect(ids).toEqual([sameGenre2.publicId, sameLang.publicId, sameGenre.publicId]);
  });

  it("still plays something with no seed, and returns nothing once everything is heard", async () => {
    const db = await setup();
    const a = await published(db, "priya");
    expect((await relatedSongs(db, { random: () => 0 })).map((p) => p.song.publicId)).toEqual([a.publicId]);
    expect(await relatedSongs(db, { exclude: [a.publicId!] })).toEqual([]);
  });
});
