import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getBalance, grantCredits, spendCredits } from "@/lib/billing/credits";
import { dropEarning, earningHundredths, earningTotals, paidRatioBp, ratioBp, settleEarning, startEarning } from "@/lib/billing/earnings";
import type { Db } from "@/lib/db";
import { creatorEarning, creatorProfile, pushToken, remixLink, song, user, voiceProfile } from "@/lib/db/schema";
import { notifyRemix } from "@/lib/push";
import { creditAmount, remixedText } from "@/lib/push-copy";
import { familyPath, familyTree, linkRemix, remixFinished, remixInbox } from "@/lib/remixes";
import { REMIX_KINDS } from "@/lib/songs/remix";
import { createSong, type Song } from "@/lib/songs/songs";
import { newGiftToken } from "@/lib/gifts";
import { testDb } from "./helpers/db";

// The remix route reads the signed-in user, env, the queue and the song safety check; the test supplies them.
const state = vi.hoisted(() => ({ userId: null as string | null, db: undefined as unknown, pro: false, queued: [] as unknown[] }));
vi.mock("@/lib/session", async (original) => ({ ...(await original<object>()), getUserId: async () => state.userId }));
vi.mock("@/lib/db", async (original) => ({ ...(await original<object>()), getDb: () => state.db }));
vi.mock("@/lib/env", async (original) => ({
  ...(await original<object>()),
  loadEnv: () => ({ BETTER_AUTH_URL: "https://reelkar.test", ACESTEP_URL: "http://acestep.test", ...(state.pro ? { RUNWARE_API_KEY: "test", FAL_KEY: "test" } : {}) }),
}));
vi.mock("@/lib/queue/songs", () => ({ getSongQueue: () => ({ add: async (...args: unknown[]) => state.queued.push(args) }) }));
vi.mock("@/lib/queue/films", () => ({ getRedis: () => ({}) }));
vi.mock("@/lib/rate-limit", () => ({ allow: async () => true }));
vi.mock("@/lib/ai/engines", () => ({ llmForUser: async () => ({}) }));
vi.mock("@/lib/songs/safety", async (original) => ({ ...(await original<object>()), assertNoRealArtists: async () => undefined }));

const remixRoute = await import("@/app/api/songs/[id]/remix/route");
const publicRoute = await import("@/app/api/listen/songs/[publicId]/route");
const familyRoute = await import("@/app/api/listen/songs/[publicId]/family/route");
const allowRoute = await import("@/app/api/songs/[id]/remixes/route");
const earningsRoute = await import("@/app/api/me/earnings/route");
const earningDetailRoute = await import("@/app/api/me/earnings/[subjectRef]/route");

const dir = mkdtempSync(path.join(tmpdir(), "remixes-"));
const audioFile = path.join(dir, "song.mp3");
writeFileSync(audioFile, "ID3 fake audio");
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let db: Db;
const as = (id: string | null) => (state.userId = id);
const p = <T extends object>(v: T) => ({ params: Promise.resolve(v) });
const url = (u: string) => `http://app.test${u}`;
const post = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// A finished song; public (with a handle) unless `private`.
async function aSong(userId: string, title: string, opts: { private?: boolean; voice?: boolean; allowRemix?: boolean; durationSec?: number } = {}): Promise<Song> {
  return createSong(db, {
    userId,
    title,
    genre: "pop",
    mood: "happy",
    language: "hi",
    lyrics: "[Verse]\nChai\n\n[Chorus]\nGaram",
    durationSec: opts.durationSec ?? 90,
    status: "completed",
    outputPath: audioFile,
    allowRemix: opts.allowRemix ?? true,
    ...(opts.private ? {} : { publicId: newGiftToken(), publishedAt: new Date() }),
  });
}

// A finished remix of `parent` by `userId`, linked like the route does.
async function aRemix(userId: string, parent: Song, title: string, opts: { private?: boolean } = {}): Promise<Song> {
  const s = await aSong(userId, title, opts);
  await db.update(song).set({ parentSongId: parent.id }).where(eq(song.id, s.id));
  await linkRemix(db, s.id, parent, "cover");
  return s;
}

const remix = (id: string, body: object) => remixRoute.POST(new Request(url(`/api/songs/${id}/remix`), post(body)), p({ id }));
const cover = { kind: "cover", style: "lo-fi chill" };

beforeEach(async () => {
  db = await testDb();
  state.db = db;
  state.pro = false;
  state.queued = [];
  as(null);
  const now = new Date();
  await db.insert(user).values(["harjot", "sana", "roohi"].map((id) => ({ id, name: id, email: `${id}@example.com`, createdAt: now, updatedAt: now })));
  await db.insert(creatorProfile).values(["harjot", "sana", "roohi"].map((id) => ({ userId: id, handle: `${id}.beats` })));
});

describe("earnings maths", () => {
  it("takes the paid share in basis points and earns floor(charged x ratio x rate) hundredths", () => {
    expect(ratioBp(0, 0)).toBe(0);
    expect(ratioBp(80, 20)).toBe(8000);
    expect(ratioBp(1, 2)).toBe(3333);
    expect(earningHundredths(1, 10_000)).toBe(10);
    expect(earningHundredths(1, 8000)).toBe(8);
    expect(earningHundredths(6, 10_000)).toBe(60);
    expect(earningHundredths(1, 0)).toBe(0);
    expect(earningHundredths(1, 10_000, 2000)).toBe(20);
  });

  it("counts purchases and plan credits as paid; grants and earnings as free; leaves refunds out", async () => {
    expect(await paidRatioBp(db, "sana")).toBe(0);
    await grantCredits(db, "sana", 20, "grant", "welcome:sana");
    expect(await paidRatioBp(db, "sana")).toBe(0);
    await grantCredits(db, "sana", 50, "purchase", "pay_1");
    await grantCredits(db, "sana", 30, "subscription", "sub_1");
    await grantCredits(db, "sana", 5, "refund", "song:x");
    await spendCredits(db, "sana", 10, "song:y", "song");
    expect(await paidRatioBp(db, "sana")).toBe(8000);
    await grantCredits(db, "sana", 25, "earning", "earning:z");
    expect(await paidRatioBp(db, "sana")).toBe(6400);
  });

  it("never earns from yourself", async () => {
    await grantCredits(db, "harjot", 50, "purchase", "pay_1");
    expect(await startEarning(db, { source: "remix", sourceRef: "s1", subjectRef: "p1", earnerId: "harjot", payerId: "harjot", charged: 1 })).toBeNull();
    expect(await db.select().from(creatorEarning)).toHaveLength(0);
  });

  it("grants on success only: ten paid remixes add one whole credit, failed ones nothing", async () => {
    await grantCredits(db, "sana", 50, "purchase", "pay_1");
    for (let i = 0; i < 12; i++) {
      const e = await startEarning(db, { source: "remix", sourceRef: `child-${i}`, subjectRef: "parent", earnerId: "harjot", payerId: "sana", charged: 1 });
      expect(e).toMatchObject({ status: "pending", hundredths: 10, paidRatioBp: 10_000, rateBp: 1000 });
    }
    // Two fail and are dropped: settling them later does nothing.
    expect(await dropEarning(db, "remix", "child-10")).toBe(true);
    expect(await dropEarning(db, "remix", "child-11")).toBe(true);
    expect(await settleEarning(db, "remix", "child-10")).toBeNull();
    for (let i = 0; i < 9; i++) expect((await settleEarning(db, "remix", `child-${i}`))?.credited).toBe(0);
    expect(await getBalance(db, "harjot")).toBe(0);
    expect(await earningTotals(db, "harjot")).toEqual({ totalHundredths: 90, credited: 0, onTheWay: 90 });
    expect((await settleEarning(db, "remix", "child-9"))?.credited).toBe(1);
    expect(await getBalance(db, "harjot")).toBe(1);
    expect(await earningTotals(db, "harjot")).toEqual({ totalHundredths: 100, credited: 1, onTheWay: 0 });
    // Settling twice never grants twice.
    expect(await settleEarning(db, "remix", "child-9")).toBeNull();
    expect(await getBalance(db, "harjot")).toBe(1);
  });

  it("adds whole credits by the floor of the running total, keeping the rest on the way", async () => {
    await grantCredits(db, "sana", 80, "purchase", "pay_1");
    await grantCredits(db, "sana", 20, "grant", "welcome:sana");
    // 6-credit remixes at an 80% paid share earn 48 hundredths each.
    for (let i = 0; i < 3; i++) {
      await startEarning(db, { source: "remix", sourceRef: `c${i}`, subjectRef: "parent", earnerId: "harjot", payerId: "sana", charged: 6 });
      await settleEarning(db, "remix", `c${i}`);
    }
    expect(await earningTotals(db, "harjot")).toEqual({ totalHundredths: 144, credited: 1, onTheWay: 44 });
    expect(await getBalance(db, "harjot")).toBe(1);
  });

  it("keeps a free remix's row, earning nothing", async () => {
    await grantCredits(db, "sana", 20, "grant", "welcome:sana");
    const e = await startEarning(db, { source: "remix", sourceRef: "c", subjectRef: "parent", earnerId: "harjot", payerId: "sana", charged: 1 });
    expect(e).toMatchObject({ hundredths: 0, paidRatioBp: 0 });
    expect(await settleEarning(db, "remix", "c")).toMatchObject({ credited: 0 });
    expect(await getBalance(db, "harjot")).toBe(0);
  });
});

describe("remixing someone else's song", () => {
  it("offers cover, extend and rap, with pro kinds only when the pro lane is on, and never replace", async () => {
    const original = await aSong("harjot", "Pind Di Kudi");
    as("sana");
    const page = (await (await publicRoute.GET(new Request(url("/")), p({ publicId: original.publicId! }))).json()) as { remix: { kinds: { kind: string; credits: number }[] }; earnRateBp: number };
    expect(page.remix.kinds.map((k) => [k.kind, k.credits])).toEqual([
      ["cover", 1],
      ["extend", 1],
      ["rap", 1],
    ]);
    expect(page.earnRateBp).toBe(1000);
    state.pro = true;
    const pro = (await (await publicRoute.GET(new Request(url("/")), p({ publicId: original.publicId! }))).json()) as { remix: { kinds: { kind: string }[] } };
    expect(pro.remix.kinds.map((k) => k.kind)).toEqual(["cover", "extend", "rap", "add-vocals", "add-instrumental"]);

    const replace = await remix(original.publicId!, { kind: "replace", startSec: 10, endSec: 20 });
    expect(replace.status).toBe(403);
    expect(((await replace.json()) as { error: string }).error).toMatch(/isn't open on other people's songs/);
    state.pro = false;
    expect((await remix(original.publicId!, { kind: "add-instrumental" })).status).toBe(503);
    expect(state.queued).toHaveLength(0);
  });

  it("links the remix, charges once and saves a pending earning for the parent's maker", async () => {
    const original = await aSong("harjot", "Pind Di Kudi");
    await grantCredits(db, "sana", 10, "purchase", "pay_1");
    as("sana");
    const res = await remix(original.publicId!, cover);
    expect(res.status).toBe(202);
    const { id } = (await res.json()) as { id: string };
    expect(await getBalance(db, "sana")).toBe(9);
    const [link] = await db.select().from(remixLink).where(eq(remixLink.childSongId, id));
    expect(link).toMatchObject({ parentSongId: original.id, parentUserId: "harjot", rootSongId: original.id, depth: 1, kind: "cover" });
    const [e] = await db.select().from(creatorEarning);
    expect(e).toMatchObject({ userId: "harjot", payerUserId: "sana", source: "remix", sourceRef: id, subjectRef: original.id, charged: 1, hundredths: 10, status: "pending" });

    // The worker finishes it: the earning counts.
    await db.update(song).set({ status: "completed", outputPath: audioFile }).where(eq(song.id, id));
    expect((await remixFinished(db, id))?.earning.status).toBe("earned");
    expect(await earningTotals(db, "harjot")).toMatchObject({ totalHundredths: 10 });
  });

  it("refuses own-voice songs and songs whose maker turned remixes off", async () => {
    const voiced = await aSong("harjot", "In my voice");
    const [voice] = await db.insert(voiceProfile).values({ userId: "harjot", name: "Me", samplePath: "/x", durationSec: 30, consentText: "yes", consentCode: "1234", transcript: "yes 1234" }).returning();
    await db.update(song).set({ voiceProfileId: voice.id }).where(eq(song.id, voiced.id));
    const off = await aSong("harjot", "No remixes", { allowRemix: false });
    as("sana");
    await grantCredits(db, "sana", 10, "purchase", "pay_1");
    expect((await remix(voiced.publicId!, cover)).status).toBe(403);
    expect((await remix(off.publicId!, cover)).status).toBe(403);
    expect(await getBalance(db, "sana")).toBe(10);
  });

  it("lets you remix your own song with every kind, earning nothing", async () => {
    const mine = await aSong("harjot", "Mine");
    await grantCredits(db, "harjot", 10, "purchase", "pay_1");
    as("harjot");
    expect((await remix(mine.publicId!, { kind: "replace", startSec: 10, endSec: 20 })).status).toBe(202);
    expect(await db.select().from(remixLink)).toHaveLength(1);
    expect(await db.select().from(creatorEarning)).toHaveLength(0);
  });

  it("earns nothing on a remix of your own remix, and the grandparent doesn't earn either", async () => {
    const original = await aSong("harjot", "Original");
    const mine = await aRemix("sana", original, "Sana's cover");
    await grantCredits(db, "sana", 10, "purchase", "pay_1");
    as("sana");
    expect((await remix(mine.publicId!, cover)).status).toBe(202);
    expect(await db.select().from(creatorEarning)).toHaveLength(0);
    const [link] = await db.select().from(remixLink).where(eq(remixLink.parentSongId, mine.id));
    expect(link).toMatchObject({ rootSongId: original.id, depth: 2 });
  });

  it("drops the earning when the parent is taken down before the remix finishes", async () => {
    const original = await aSong("harjot", "Original");
    await grantCredits(db, "sana", 10, "purchase", "pay_1");
    as("sana");
    const { id } = (await (await remix(original.publicId!, cover)).json()) as { id: string };
    await db.update(song).set({ takenDownAt: new Date() }).where(eq(song.id, original.id));
    expect(await remixFinished(db, id)).toBeNull();
    const [e] = await db.select().from(creatorEarning);
    expect(e.status).toBe("dropped");
  });
});

describe("Allow remixes off", () => {
  it("hides Remix, refuses new remixes and keeps the ones already made", async () => {
    const original = await aSong("harjot", "Pind Di Kudi");
    const existing = await aRemix("sana", original, "Sana's cover");
    as("harjot");
    const off = await allowRoute.PATCH(new Request(url("/"), { method: "PATCH", body: JSON.stringify({ allow: false }) }), p({ id: original.publicId! }));
    expect(await off.json()).toEqual({ allowRemix: false });
    as("roohi");
    await grantCredits(db, "roohi", 10, "purchase", "pay_1");
    const page = (await (await publicRoute.GET(new Request(url("/")), p({ publicId: original.publicId! }))).json()) as {
      remix: { kinds: unknown[]; blocked: string };
      family: { allowRemix: boolean; remixCount: number; top: { publicId: string }[] };
    };
    expect(page.remix).toEqual({ kinds: [], blocked: "off" });
    expect(page.family).toMatchObject({ allowRemix: false, remixCount: 1 });
    expect(page.family.top.map((n) => n.publicId)).toEqual([existing.publicId]);
    expect((await remix(original.publicId!, cover)).status).toBe(403);
    expect(await getBalance(db, "roohi")).toBe(10);
    // Remixes of the remix follow their own maker's switch.
    expect((await remix(existing.publicId!, cover)).status).toBe(202);
    // Only the maker can flip it.
    expect((await allowRoute.PATCH(new Request(url("/"), { method: "PATCH", body: JSON.stringify({ allow: true }) }), p({ id: original.publicId! }))).status).toBe(404);
  });
});

describe("family tree", () => {
  it("shows public songs, a hidden song in the middle as gone with its remixes under it, and leaves out private leaves", async () => {
    const root = await aSong("harjot", "Pind Di Kudi");
    const a = await aRemix("sana", root, "Cover A");
    const hidden = await aRemix("roohi", root, "Made private");
    const c = await aRemix("sana", hidden, "Remix of hidden");
    await aRemix("roohi", a, "Private leaf", { private: true });
    await db.update(song).set({ playCount: 50 }).where(eq(song.id, a.id));

    const tree = await familyTree(db, c);
    await db.update(song).set({ publishedAt: null }).where(eq(song.id, hidden.id));
    const after = await familyTree(db, c);
    expect(tree.size).toBe(4);
    expect(after.size).toBe(3);
    expect(after.rows.map((r) => [r.level, r.gone ? "gone" : r.title, r.current])).toEqual([
      [0, "Pind Di Kudi", false],
      [1, "Cover A", false],
      [1, "gone", false],
      [2, "Remix of hidden", true],
    ]);
    const gone = after.rows[2];
    expect(gone).toMatchObject({ publicId: null, title: null, handle: null, coverUrl: null });
    expect(after.rows[0].remixCount).toBe(1);

    const { path } = await familyPath(db, c.id);
    expect(path.map((n) => (n.gone ? "gone" : n.title))).toEqual(["Pind Di Kudi", "gone"]);
  });

  it("keeps a deleted middle song's remixes in the family as a gone node", async () => {
    const root = await aSong("harjot", "Root");
    const mid = await aRemix("sana", root, "Mid");
    const leaf = await aRemix("roohi", mid, "Leaf");
    await db.delete(song).where(eq(song.id, mid.id));
    const tree = await familyTree(db, leaf);
    expect(tree.rows.map((r) => [r.level, r.gone ? "gone" : r.title])).toEqual([
      [0, "Root"],
      [1, "gone"],
      [2, "Leaf"],
    ]);
  });

  it("shows the first 3 remixes of each song, the rest on request, by Top or Newest", async () => {
    const root = await aSong("harjot", "Root");
    for (let i = 0; i < 5; i++) {
      const r = await aRemix("sana", root, `Cover ${i}`);
      await db.update(song).set({ playCount: i }).where(eq(song.id, r.id));
    }
    const top = await familyTree(db, root);
    expect(top.rows.map((r) => r.title)).toEqual(["Root", "Cover 4", "Cover 3", "Cover 2"]);
    expect(top.rows[0].more).toBe(2);
    const all = await familyTree(db, root, { branch: root.publicId! });
    expect(all.rows).toHaveLength(6);
    expect(all.rows[0].more).toBe(0);

    const res = await familyRoute.GET(new Request(url(`/api/listen/songs/${root.publicId}/family?sort=new`)), p({ publicId: root.publicId! }));
    const body = (await res.json()) as { sort: string; rows: { title: string }[] };
    expect(body.sort).toBe("new");
    expect(body.rows[1].title).toBe("Cover 4");
  });

  it("shortens a long path to the original, a count and the parent", async () => {
    let at = await aSong("harjot", "Song 0");
    const all = [at];
    for (let i = 1; i <= 5; i++) all.push((at = await aRemix(i % 2 ? "sana" : "roohi", at, `Song ${i}`)));
    const { path, more } = await familyPath(db, at.id);
    expect(path.map((n) => n.title)).toEqual(["Song 0", "Song 4"]);
    expect(more).toBe(3);
  });
});

describe("Earnings API and Inbox", () => {
  it("lists earnings by song and each remix, naming only public remixers", async () => {
    const original = await aSong("harjot", "Pind Di Kudi");
    const pub = await aRemix("sana", original, "Sana's cover");
    const priv = await aRemix("roohi", original, "Roohi's cover", { private: true });
    await grantCredits(db, "sana", 10, "purchase", "pay_1");
    await grantCredits(db, "roohi", 10, "grant", "welcome:roohi");
    for (const [child, payer] of [
      [pub, "sana"],
      [priv, "roohi"],
    ] as const) {
      await startEarning(db, { source: "remix", sourceRef: child.id, subjectRef: original.id, earnerId: "harjot", payerId: payer, charged: 1 });
      await settleEarning(db, "remix", child.id);
    }
    as("harjot");
    const sum = (await (await earningsRoute.GET(new Request(url("/api/me/earnings?source=remix")))).json()) as { totalHundredths: number; rateBp: number; bySubject: { title: string; count: number; hundredths: number }[] };
    expect(sum).toMatchObject({ totalHundredths: 10, credited: 0, onTheWay: 10, rateBp: 1000 });
    expect(sum.bySubject).toEqual([expect.objectContaining({ source: "remix", subjectRef: original.id, title: "Pind Di Kudi", count: 2, hundredths: 10 })]);
    const recipes = (await (await earningsRoute.GET(new Request(url("/api/me/earnings?source=recipe")))).json()) as { bySubject: unknown[] };
    expect(recipes.bySubject).toEqual([]);

    const detail = (await (await earningDetailRoute.GET(new Request(url("/")), p({ subjectRef: original.id }))).json()) as { events: { remixerHandle: string | null; free: boolean; hundredths: number }[] };
    expect(detail.events.map((e) => [e.remixerHandle, e.free, e.hundredths]).sort()).toEqual([
      ["sana.beats", false, 10],
      [null, true, 0],
    ].sort());

    const inbox = await remixInbox(db, "harjot");
    expect(inbox.map((i) => [i.kind, i.remixerHandle, i.hundredths]).sort()).toEqual([
      ["private", null, 0],
      ["published", "sana.beats", 10],
    ]);
    // Someone else sees none of it.
    as("sana");
    expect(((await (await earningsRoute.GET(new Request(url("/api/me/earnings")))).json()) as { bySubject: unknown[] }).bySubject).toEqual([]);
  });
});

describe("remix push", () => {
  it("tells the maker once a day per song, with what it earned", async () => {
    const original = await aSong("harjot", "Pind Di Kudi");
    await db.insert(pushToken).values({ token: "ExponentPushToken[abc]", userId: "harjot", lang: "en" });
    await grantCredits(db, "sana", 10, "purchase", "pay_1");
    const sent: { title: string; body: string; data: { path: string } }[] = [];
    const fetchFn = (async (_u: string, init: RequestInit) => {
      sent.push(...JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ data: [{ status: "ok" }] }));
    }) as typeof fetch;
    for (const i of [1, 2]) {
      const child = await aRemix("sana", original, `Cover ${i}`);
      await startEarning(db, { source: "remix", sourceRef: child.id, subjectRef: original.id, earnerId: "harjot", payerId: "sana", charged: 1 });
      const settled = await remixFinished(db, child.id);
      await notifyRemix(db, settled!.earning, fetchFn, { receiptDelayMs: null });
    }
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ title: "Your song is being remixed", body: 'Someone made a remix of "Pind Di Kudi". You earned 0.1 credit.', data: { path: `/earn/${original.id}` } });
    expect(remixedText("hi", "X", 0).body).toBe('किसी ने "X" का रीमिक्स बनाया।');
    expect([creditAmount("en", 230), creditAmount("en", 8), creditAmount("en", 100)]).toEqual(["2.3", "0.08", "1.0"]);
  });
});

describe("schema", () => {
  it("keeps remix_kind the same as REMIX_KINDS", async () => {
    const rows = await db.execute(sql`select unnest(enum_range(null::remix_kind))::text as k`);
    expect((rows as unknown as { rows: { k: string }[] }).rows.map((r) => r.k)).toEqual([...REMIX_KINDS]);
  });

  it("backfills remix links from existing remixes, skipping my-voice versions and own edits", async () => {
    const root = await aSong("harjot", "Root");
    const theirs = await aSong("sana", "Root (cover)");
    const rap = await aSong("sana", "Root (cover) (rap)");
    const edit = await aSong("harjot", "Root (edit)");
    await db.update(song).set({ parentSongId: root.id }).where(eq(song.id, theirs.id));
    await db.update(song).set({ parentSongId: theirs.id }).where(eq(song.id, rap.id));
    await db.update(song).set({ parentSongId: root.id }).where(eq(song.id, edit.id));
    const migration = readFileSync(path.join("drizzle", "0028_shiny_loa.sql"), "utf8");
    const backfill = migration.slice(migration.indexOf("WITH RECURSIVE"));
    await db.execute(sql.raw(backfill));
    const links = await db.select().from(remixLink);
    const by = new Map(links.map((l) => [l.childSongId, l]));
    expect(links).toHaveLength(2);
    expect(by.get(theirs.id)).toMatchObject({ parentSongId: root.id, rootSongId: root.id, depth: 1, kind: "cover", parentUserId: "harjot" });
    expect(by.get(rap.id)).toMatchObject({ parentSongId: theirs.id, rootSongId: root.id, depth: 2, kind: "rap", parentUserId: "sana" });
  });
});
