import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { gift as giftTable, recipe, socialAccount, song as songTable, user } from "@/lib/db/schema";
import { grantCredits } from "@/lib/billing/credits";
import { inviteByHandle, listDuets, savePart, startDuet } from "@/lib/duets";
import { createReplyGift, giftState, insertGift, listGifts, publicGift, replyTarget } from "@/lib/gifts";
import { listenHome, publicSong, publicSongView, publishSong, rail, relatedSongs, setHandle, songRails } from "@/lib/listen";
import { AUTO_HIDE_REPORTERS, blockTarget, blockUser, fileReport, isBlocked, listBlocks, reporterKey, unblockUser, type HideAlert } from "@/lib/moderation";
import { listRecipes } from "@/lib/recipes";
import { familyTree, linkRemix, topRemixes } from "@/lib/remixes";
import { createSong, type Song } from "@/lib/songs/songs";
import { testDb } from "./helpers/db";

const dir = mkdtempSync(path.join(tmpdir(), "moderation-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const take = path.join(dir, "take.mp3");
writeFileSync(take, "fake mp3");

const PEOPLE = ["priya", "imran", "listener", "r1", "r2", "r3"];

async function setup(): Promise<Db> {
  const db = await testDb();
  const now = new Date();
  await db.insert(user).values(PEOPLE.map((id) => ({ id, name: id, email: `${id}@example.com`, createdAt: now, updatedAt: now })));
  return db;
}

async function published(db: Db, userId: string, title = "Chai pe charcha"): Promise<Song> {
  await setHandle(db, userId, `${userId}.music`);
  const s = await createSong(db, { userId, title, genre: "pop", mood: "happy", language: "hi", lyrics: "[Verse]\nChai", durationSec: 90, status: "completed", outputPath: "/tmp/song.mp3" });
  const r = await publishSong(db, userId, s.id, { showLyrics: true, allowRemix: true }, async () => undefined);
  if (!("song" in r)) throw new Error(r.error);
  return r.song;
}

const report = { reason: "hateful" as const, details: "" };
const handlesIn = (cards: { handle: string }[]) => new Set(cards.map((c) => c.handle));

describe("blocking a creator", () => {
  it("hides their songs from the blocker's rails, autoplay and song page rails, and comes back on unblock", async () => {
    const db = await setup();
    const p1 = await published(db, "priya", "Baarish");
    await published(db, "priya", "Dhoop");
    const i1 = await published(db, "imran", "Ya habibi");

    expect(handlesIn((await listenHome(db, { viewerId: "listener" })).new)).toEqual(new Set(["priya.music", "imran.music"]));
    const target = await blockTarget(db, "listener", { handle: "@Priya.Music" });
    expect(target).toEqual({ userId: "priya" });
    expect(await blockUser(db, "listener", "priya")).toEqual({ ok: true });
    // Blocking twice is fine.
    expect(await blockUser(db, "listener", "priya")).toEqual({ ok: true });
    expect(await isBlocked(db, "listener", "priya")).toBe(true);

    expect(handlesIn((await listenHome(db, { viewerId: "listener" })).new)).toEqual(new Set(["imran.music"]));
    expect(handlesIn(await rail(db, "new", { viewerId: "listener" }).then((rows) => rows.map((r) => ({ handle: r.handle }))))).toEqual(new Set(["imran.music"]));
    expect((await relatedSongs(db, { viewerId: "listener", limit: 10 })).map((r) => r.song.userId)).toEqual(["imran"]);
    const page = (await publicSong(db, p1.publicId!))!;
    expect((await songRails(db, page, "listener")).byCreator).toEqual([]);
    expect((await publicSongView(db, page, "listener")).creatorBlocked).toBe(true);
    // Everyone else still sees them.
    expect((await songRails(db, page, "imran")).byCreator).toHaveLength(1);
    expect(handlesIn((await listenHome(db, { viewerId: "imran" })).new)).toContain("priya.music");
    expect((await publicSongView(db, (await publicSong(db, i1.publicId!))!, "listener")).creatorBlocked).toBe(false);

    expect(await listBlocks(db, "listener")).toMatchObject([{ userId: "priya", handle: "priya.music", name: "@priya.music" }]);
    await unblockUser(db, "listener", "priya");
    expect(handlesIn((await listenHome(db, { viewerId: "listener" })).new)).toContain("priya.music");
    expect(await listBlocks(db, "listener")).toEqual([]);
  });

  it("can't block yourself or someone unknown", async () => {
    const db = await setup();
    expect(await blockUser(db, "priya", "priya")).toMatchObject({ status: 400 });
    expect(await blockTarget(db, "priya", { handle: "nobody" })).toMatchObject({ status: 404 });
    expect(await blockTarget(db, "priya", { duet: "not-a-uuid" })).toMatchObject({ status: 404 });
  });

  it("hides songs the viewer reported from their lists", async () => {
    const db = await setup();
    const p1 = await published(db, "priya", "Baarish");
    const p2 = await published(db, "priya", "Dhoop");
    await fileReport(db, "song", p1.id, report, { userId: "listener" }, () => undefined);
    const titles = (await listenHome(db, { viewerId: "listener" })).new.map((c) => c.title);
    expect(titles).toEqual(["Dhoop"]);
    expect((await relatedSongs(db, { viewerId: "listener", limit: 10 })).map((r) => r.song.id)).toEqual([p2.id]);
    expect((await listenHome(db, { viewerId: "imran" })).new).toHaveLength(2);
  });

  it("hides a blocked creator's remixes in the family", async () => {
    const db = await setup();
    const original = await published(db, "priya");
    const remix = await published(db, "imran", "Chai (cover)");
    await linkRemix(db, remix.id, original, "cover");
    expect(await topRemixes(db, original.id, 3, "listener")).toHaveLength(1);
    await blockUser(db, "listener", "imran");
    expect(await topRemixes(db, original.id, 3, "listener")).toEqual([]);
    const tree = await familyTree(db, original, { viewerId: "listener" });
    expect(tree.rows.filter((r) => !r.gone).map((r) => r.handle)).toEqual(["priya.music"]);
    expect((await familyTree(db, original, { viewerId: "r1" })).rows.filter((r) => !r.gone)).toHaveLength(2);
  });

  it("hides a blocked maker's recipes", async () => {
    const db = await setup();
    await setHandle(db, "priya", "priya.music");
    await db.insert(recipe).values({ publicId: "aaaaaaaaaa", makerId: "priya", format: "motion", name: "Diwali tips", spec: { format: "motion" }, durationSec: 30, publishedAt: new Date() });
    expect(await listRecipes(db, { viewerId: "listener" })).toHaveLength(1);
    await blockUser(db, "listener", "priya");
    expect(await listRecipes(db, { viewerId: "listener" })).toEqual([]);
    expect(await listRecipes(db, { viewerId: "listener", makerHandle: "priya.music" })).toEqual([]);
    expect(await listRecipes(db, { viewerId: "imran" })).toHaveLength(1);
  });

  it("stops a blocked person's songs sent back reaching the blocker", async () => {
    const db = await setup();
    const s = await createSong(db, { userId: "priya", title: "For you", genre: "pop", language: "hi", lyrics: "x", durationSec: 60, status: "completed", outputPath: "/tmp/a.mp3" });
    const original = await insertGift(db, { songId: s.id, senderId: "priya", toName: "Imran", occasion: "birthday" });
    const back = await createSong(db, { userId: "imran", title: "Thanks", genre: "pop", language: "hi", lyrics: "x", durationSec: 60, status: "completed", outputPath: "/tmp/b.mp3" });
    const before = await replyTarget(db, "imran", original.token);
    expect(before).toMatchObject({ blocked: false });
    const reply = await createReplyGift(db, { userId: "imran", songId: back.id, original, senderName: "Priya", free: true });
    expect((await listGifts(db, "priya")).replies).toHaveLength(1);

    expect(await blockTarget(db, "priya", { gift: reply.token })).toEqual({ userId: "imran" });
    await blockUser(db, "priya", "imran");
    expect((await listGifts(db, "priya")).replies).toEqual([]);
    expect(await replyTarget(db, "imran", original.token)).toMatchObject({ blocked: true });
  });

  it("stops a blocked person's Jugalbandi invites reaching the blocker", async () => {
    const db = await setup();
    await grantCredits(db, "priya", 20, "grant", "welcome:priya");
    await db.insert(socialAccount).values({ userId: "imran", platform: "instagram", externalId: "9", name: "@imran.sings", accessToken: "x", refreshToken: "x", expiresAt: new Date() });
    const start = () => startDuet(db, "priya", { topic: "Chai vs coffee", genre: "pop", language: "hi", name: "Priya", ig: "" });
    const take1 = { mp3: take, kind: "hum" as const, transcript: "", durationSec: 20 };
    const d1 = await inviteByHandle(db, await savePart(db, dir, await start(), "a", take1), "imran.sings");
    expect((await listDuets(db, "imran")).map((d) => d.id)).toEqual([d1.id]);
    expect(await blockTarget(db, "imran", { duet: d1.id })).toEqual({ userId: "priya" });
    await blockUser(db, "imran", "priya");
    // The existing invite goes away, and a new one can't be sent (without saying why).
    expect(await listDuets(db, "imran")).toEqual([]);
    const d2 = await savePart(db, dir, await start(), "a", take1);
    await expect(inviteByHandle(db, d2, "imran.sings")).rejects.toMatchObject({ status: 404 });
  });
});

describe("auto-hide after reports", () => {
  it("hides a song after reports from 3 different people, and tells the team once", async () => {
    const db = await setup();
    const s = await published(db, "priya");
    const alerts: HideAlert[] = [];
    const alert = (a: HideAlert) => void alerts.push(a);
    expect(await fileReport(db, "song", s.id, report, { userId: "r1" }, alert)).toEqual({ hidden: false });
    // The same person again, and the same signed-out IP twice, count once each.
    expect(await fileReport(db, "song", s.id, report, { userId: "r1" }, alert)).toEqual({ hidden: false });
    expect(await fileReport(db, "song", s.id, report, { ip: "10.0.0.9" }, alert)).toEqual({ hidden: false });
    expect(await fileReport(db, "song", s.id, report, { ip: "10.0.0.9" }, alert)).toEqual({ hidden: false });
    expect((await listenHome(db, { viewerId: "imran" })).new).toHaveLength(1);
    expect(await fileReport(db, "song", s.id, report, { userId: "r2" }, alert)).toEqual({ hidden: true });
    expect(AUTO_HIDE_REPORTERS).toBe(3);
    expect(alerts).toEqual([{ kind: "song", id: s.id, path: `/s/${s.publicId}`, reporters: 3, minorSexual: false }]);

    const [row] = await db.select().from(songTable).where(eq(songTable.id, s.id));
    expect(row.hiddenAt).toBeInstanceOf(Date);
    expect(row.takenDownAt).toBeNull();
    expect((await listenHome(db, { viewerId: "imran" })).new).toEqual([]);
    expect((await publicSongView(db, (await publicSong(db, s.publicId!))!, "imran")).state).toBe("taken_down");
    // More reports don't alert again.
    await fileReport(db, "song", s.id, report, { userId: "r3" }, alert);
    expect(alerts).toHaveLength(1);
    // Review: not upheld, so it comes back.
    await db.update(songTable).set({ hiddenAt: null }).where(eq(songTable.id, s.id));
    expect((await listenHome(db, { viewerId: "imran" })).new).toHaveLength(1);
  });

  it("hides at once on one report of sexual content involving a minor", async () => {
    const db = await setup();
    const s = await createSong(db, { userId: "priya", title: "For you", genre: "pop", language: "hi", lyrics: "x", durationSec: 60, status: "completed", outputPath: "/tmp/a.mp3" });
    const g = await insertGift(db, { songId: s.id, senderId: "priya", toName: "Imran", occasion: "birthday" });
    const alerts: HideAlert[] = [];
    expect(await fileReport(db, "gift", g.id, { reason: "minor_sexual", details: "" }, { ip: "1.2.3.4" }, (a) => void alerts.push(a))).toEqual({ hidden: true });
    expect(alerts[0]).toMatchObject({ kind: "gift", path: `/g/${g.token}`, minorSexual: true });
    expect(giftState((await publicGift(db, g.token))!)).toBe("taken_down");
  });

  it("hides recipes too, and an alert that fails doesn't stop the report", async () => {
    const db = await setup();
    await setHandle(db, "priya", "priya.music");
    const [r] = await db.insert(recipe).values({ publicId: "bbbbbbbbbb", makerId: "priya", format: "motion", name: "Tips", spec: { format: "motion" }, durationSec: 30, publishedAt: new Date() }).returning();
    const boom = () => {
      throw new Error("no email");
    };
    for (const userId of ["r1", "r2", "r3"]) await fileReport(db, "recipe", r.id, report, { userId }, boom);
    expect(await listRecipes(db, {})).toEqual([]);
  });

  it("keys reporters by account, else by a hash of the IP", () => {
    expect(reporterKey({ userId: "u1", ip: "1.1.1.1" })).toBe("u:u1");
    const k = reporterKey({ ip: "1.1.1.1" })!;
    expect(k).toMatch(/^ip:[0-9a-f]{20}$/);
    expect(k).not.toContain("1.1.1.1");
    expect(reporterKey({})).toBeNull();
  });

  it("doesn't touch a gift that's already taken down", async () => {
    const db = await setup();
    const s = await createSong(db, { userId: "priya", title: "For you", genre: "pop", language: "hi", lyrics: "x", durationSec: 60, status: "completed", outputPath: "/tmp/a.mp3" });
    const g = await insertGift(db, { songId: s.id, senderId: "priya", toName: "Imran", occasion: "birthday" });
    await db.update(giftTable).set({ takenDownAt: new Date() }).where(eq(giftTable.id, g.id));
    expect(await fileReport(db, "gift", g.id, { reason: "minor_sexual", details: "" }, { userId: "r1" }, () => undefined)).toEqual({ hidden: false });
  });
});
