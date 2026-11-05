import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { gift, user } from "@/lib/db/schema";
import {
  countPlay,
  createReplyGift,
  GIFT_TOKEN,
  giftState,
  insertGift,
  listGifts,
  markOpened,
  newGiftSchema,
  newGiftToken,
  publicGift,
  publicGiftView,
  replyTarget,
  saveReport,
  senderDisplayName,
  setSharing,
} from "@/lib/gifts";
import type { LlmProvider } from "@/lib/providers/types";
import { assertNoRealArtists, SongSafetyError } from "@/lib/songs/safety";
import { createSong, updateSong } from "@/lib/songs/songs";
import { pickLang, previewText } from "@/app/g/[token]/copy";
import { testDb } from "./helpers/db";

async function setup(): Promise<Db> {
  const db = await testDb();
  const now = new Date();
  await db.insert(user).values([
    { id: "rajnish", name: "Rajnish", email: "r@example.com", createdAt: now, updatedAt: now },
    { id: "priya", name: "Priya", email: "p@example.com", createdAt: now, updatedAt: now },
  ]);
  return db;
}

async function song(db: Db, userId: string, status: "queued" | "completed" | "failed" = "completed") {
  return createSong(db, {
    userId,
    title: "Happy birthday Priya",
    genre: "pop",
    language: "hi",
    lyrics: "[Verse]\nPriya, the candles wait\nAnother year of light\n\n[Chorus]\nHappy birthday",
    durationSec: 108,
    status,
    outputPath: status === "completed" ? "/tmp/song.mp3" : null,
  });
}

async function sendGift(db: Db) {
  const s = await song(db, "rajnish");
  return insertGift(db, { songId: s.id, senderId: "rajnish", toName: "Priya", occasion: "birthday", note: "Play it loud!" });
}

describe("gift links", () => {
  it("makes short tokens without look-alike letters", () => {
    for (let i = 0; i < 200; i++) {
      const t = newGiftToken();
      expect(t).toMatch(GIFT_TOKEN);
      expect(t).not.toMatch(/[01lIoO]/);
    }
    expect(GIFT_TOKEN.test("../../etc")).toBe(false);
  });

  it("checks the gift step's fields", () => {
    expect(newGiftSchema.safeParse({ toName: " ", occasion: "birthday" }).success).toBe(false);
    expect(newGiftSchema.safeParse({ toName: "Priya", occasion: "graduation" }).success).toBe(false);
    expect(newGiftSchema.safeParse({ toName: "Priya", occasion: "eid", note: "x".repeat(201) }).success).toBe(false);
    expect(newGiftSchema.parse({ toName: " Priya ", occasion: "eid", address: "her" })).toMatchObject({ toName: "Priya", note: "", address: "her" });
  });

  it("shows a public gift with no ids or paths, and hides it once sharing stops", async () => {
    const db = await setup();
    const g = await sendGift(db);
    const found = (await publicGift(db, g.token))!;
    const view = publicGiftView(found);
    expect(view).toMatchObject({ state: "ready", toName: "Priya", fromName: "Rajnish", note: "Play it loud!", audioUrl: `/api/g/${g.token}/audio` });
    expect(view.lines).toEqual(["Priya, the candles wait", "Another year of light", "Happy birthday"]);
    expect(JSON.stringify(view)).not.toContain("/tmp/song.mp3");
    expect(JSON.stringify(view)).not.toContain("rajnish");

    await setSharing(db, "rajnish", g.id, false);
    expect(giftState((await publicGift(db, g.token))!)).toBe("removed");
    // Only the sender can stop or restart sharing.
    expect(await setSharing(db, "priya", g.id, true)).toBeUndefined();
    await setSharing(db, "rajnish", g.id, true);
    expect(giftState((await publicGift(db, g.token))!)).toBe("ready");
    expect(await publicGift(db, "zzzzzzzzzz")).toBeNull();
  });

  it("says a gift is still being made, and never shows its audio until it's ready", async () => {
    const db = await setup();
    const s = await song(db, "rajnish", "queued");
    const g = await insertGift(db, { songId: s.id, senderId: "rajnish", toName: "Priya", occasion: "eid" });
    const view = publicGiftView((await publicGift(db, g.token))!);
    expect(view.state).toBe("processing");
    expect(view.audioUrl).toBeNull();
    expect(view.lines).toEqual([]);
  });

  it("counts one play per browser per day, and marks it opened", async () => {
    const db = await setup();
    const g = await sendGift(db);
    await markOpened(db, g.id);
    const day1 = new Date("2026-11-06T10:00:00Z");
    expect(await countPlay(db, g.id, "browser-a", day1)).toBe(true);
    expect(await countPlay(db, g.id, "browser-a", day1)).toBe(false);
    expect(await countPlay(db, g.id, "browser-b", day1)).toBe(true);
    expect(await countPlay(db, g.id, "browser-a", new Date("2026-11-07T10:00:00Z"))).toBe(true);
    const row = (await publicGift(db, g.token))!.gift;
    expect(row.playCount).toBe(3);
    expect(row.openedAt).not.toBeNull();
    expect(row.lastPlayedAt?.toISOString()).toBe("2026-11-07T10:00:00.000Z");
  });

  it("keeps reports", async () => {
    const db = await setup();
    const g = await sendGift(db);
    await saveReport(db, g.id, { reason: "voice_or_likeness", details: "That's my voice", email: undefined });
    const rows = await db.query.giftReport.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ giftId: g.id, reason: "voice_or_likeness", email: null });
  });
});

describe("replies", () => {
  it("makes the first reply free, once per person per gift", async () => {
    const db = await setup();
    const g = await sendGift(db);
    const first = await replyTarget(db, "priya", g.token);
    expect(first).toMatchObject({ free: true, senderName: "Rajnish" });
    if ("error" in first) throw new Error(first.error);

    const replySong = await song(db, "priya", "queued");
    const reply = await createReplyGift(db, { userId: "priya", songId: replySong.id, original: first.original, senderName: first.senderName, free: true });
    expect(reply).toMatchObject({ toName: "Rajnish", occasion: "birthday", replyToGiftId: g.id, freeReply: true });

    expect(await replyTarget(db, "priya", g.token)).toMatchObject({ free: false });
  });

  it("gives the free reply back when its song failed", async () => {
    const db = await setup();
    const g = await sendGift(db);
    const replySong = await song(db, "priya", "queued");
    const first = await replyTarget(db, "priya", g.token);
    if ("error" in first) throw new Error(first.error);
    await createReplyGift(db, { userId: "priya", songId: replySong.id, original: first.original, senderName: first.senderName, free: true });
    await updateSong(db, replySong.id, { status: "failed" });
    expect(await replyTarget(db, "priya", g.token)).toMatchObject({ free: true });
  });

  it("refuses replies to your own gift, and to a gift that stopped sharing", async () => {
    const db = await setup();
    const g = await sendGift(db);
    expect(await replyTarget(db, "rajnish", g.token)).toMatchObject({ status: 400 });
    await setSharing(db, "rajnish", g.id, false);
    expect(await replyTarget(db, "priya", g.token)).toMatchObject({ status: 410 });
    expect(await replyTarget(db, "priya", "nope")).toMatchObject({ status: 404 });
  });

  it("lists sent gifts and the replies that came back", async () => {
    const db = await setup();
    const g = await sendGift(db);
    const first = await replyTarget(db, "priya", g.token);
    if ("error" in first) throw new Error(first.error);
    const replySong = await song(db, "priya");
    const reply = await createReplyGift(db, { userId: "priya", songId: replySong.id, original: first.original, senderName: first.senderName, free: true });

    const mine = await listGifts(db, "rajnish");
    expect(mine.sent.map((r) => r.gift.id)).toEqual([g.id]);
    expect(mine.replies).toHaveLength(1);
    expect(mine.replies[0]).toMatchObject({ fromName: "Priya", originalId: g.id });

    // Priya sees her reply as a gift she sent, not as one that came back.
    const hers = await listGifts(db, "priya");
    expect(hers.sent.map((r) => r.gift.id)).toEqual([reply.id]);
    expect(hers.replies).toHaveLength(0);

    // The reply's page links back to the original while it's shared.
    expect(publicGiftView((await publicGift(db, reply.token))!).replyTo).toEqual({ token: g.token, occasion: "birthday" });
    await db.update(gift).set({ revokedAt: new Date() });
    expect(publicGiftView((await publicGift(db, reply.token))!).state).toBe("removed");
  });
});

describe("gift page language", () => {
  it("follows the browser among English, Hindi and Arabic", () => {
    expect(pickLang("ar-AE,ar;q=0.9,en;q=0.8")).toBe("ar");
    expect(pickLang("hi-IN,hi;q=0.9")).toBe("hi");
    expect(pickLang("fr-FR,en;q=0.5")).toBe("en");
    expect(pickLang(null)).toBe("en");
  });

  it("keeps the note out of the link preview", () => {
    const p = previewText("en", { toName: "Priya", fromName: "Rajnish", occasion: "birthday" }, null);
    expect(p).toEqual({ title: "Birthday song for Priya", description: "From Rajnish · Tap to open · Made with AI" });
    expect(previewText("ar", { toName: "مريم", fromName: "عمر", occasion: "eid" }, "her").description).toContain("اضغطي");
  });
});

describe("names in a reply", () => {
  const llm = (realPerson: boolean, prompts: string[] = []) =>
    ({ completeJson: async (p: string) => (prompts.push(p), { realPerson }) }) as unknown as LlmProvider;

  it("doesn't take the gift's sender for a singer", async () => {
    // "Mukesh" is on the blocked list (the singer), and a common first name.
    await expect(assertNoRealArtists(llm(false), ["A thank-you song for Mukesh"])).rejects.toThrow(SongSafetyError);
    const prompts: string[] = [];
    await expect(assertNoRealArtists(llm(false, prompts), ["A thank-you song for Mukesh"], ["Mukesh"])).resolves.toBeUndefined();
    expect(prompts[0]).toContain("private people this song is for or from, not artists: Mukesh");
    // Other real artists in the same request are still caught.
    await expect(assertNoRealArtists(llm(false), ["For Mukesh, in the style of Arijit Singh"], ["Mukesh"])).rejects.toThrow(/arijit/i);
  });
});

describe("the name a gift is signed with", () => {
  it("prefers the typed name, then a real account name, never a placeholder", () => {
    expect(senderDisplayName("Bhaiya", "Rajnish")).toBe("Bhaiya");
    expect(senderDisplayName("", "Rajnish")).toBe("Rajnish");
    expect(senderDisplayName("", "Creator 3210")).toBe("A friend");
    expect(senderDisplayName(" ", "")).toBe("A friend");
  });

  it("signs a reply with the replier's name and sends it to the name the original was signed with", async () => {
    const db = await setup();
    const s = await song(db, "rajnish");
    const g = await insertGift(db, { songId: s.id, senderId: "rajnish", toName: "Priya", fromName: "Bhaiya", occasion: "rakhi" });
    expect(publicGiftView((await publicGift(db, g.token))!).fromName).toBe("Bhaiya");
    const target = await replyTarget(db, "priya", g.token);
    if ("error" in target) throw new Error(target.error);
    const replySong = await song(db, "priya");
    const reply = await createReplyGift(db, { userId: "priya", songId: replySong.id, original: target.original, senderName: target.senderName, free: true, fromName: "Chhoti" });
    expect(reply.toName).toBe("Bhaiya");
    expect((await listGifts(db, "rajnish")).replies[0].fromName).toBe("Chhoti");
  });
});
