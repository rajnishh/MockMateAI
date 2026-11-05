import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db";
import { pushToken, user } from "@/lib/db/schema";
import { createFilm, updateFilm } from "@/lib/films";
import { insertGift } from "@/lib/gifts";
import { giftOpenedText, songReadyText } from "@/lib/push-copy";
import { getPushPrefs, notifyReel, notifySong, savePushToken, sendPush, setPushPrefs } from "@/lib/push";
import { createSong, updateSong } from "@/lib/songs/songs";
import { testDb } from "./helpers/db";

// The routes read the signed-in user and the database; the test supplies both. Expo's push API is faked.
const state = vi.hoisted(() => ({ userId: null as string | null, db: undefined as unknown }));
vi.mock("@/lib/session", async (original) => ({ ...(await original<object>()), getUserId: async () => state.userId }));
vi.mock("@/lib/db", async (original) => ({ ...(await original<object>()), getDb: () => state.db }));
vi.mock("@/lib/rate-limit", () => ({ allow: async () => true }));
vi.mock("@/lib/queue/films", async (original) => ({ ...(await original<object>()), getRedis: () => ({}) }));

const tokensRoute = await import("@/app/api/push-tokens/route");
const settingsRoute = await import("@/app/api/push-settings/route");
const eventRoute = await import("@/app/api/g/[token]/event/route");

const PHONE = "ExponentPushToken[aaaaaaaaaaaaaaaa]";
const PHONE_2 = "ExponentPushToken[bbbbbbbbbbbbbbbb]";
const NO_RECEIPTS = { receiptDelayMs: null };

interface Message {
  to: string;
  title: string;
  body: string;
  data: { path: string };
}

// Answers like exp.host: one ticket per message, and receipts by id. Tokens in `dead` are gone.
function fakeExpo(dead: { tickets?: string[]; receipts?: string[] } = {}) {
  const calls: { url: string; body: unknown; auth: string | null }[] = [];
  const ticketTo = new Map<string, string>();
  let n = 0;
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ url: String(url), body, auth: new Headers(init?.headers).get("authorization") });
    if (String(url).endsWith("/send")) {
      const data = (body as Message[]).map((m) => {
        if (dead.tickets?.includes(m.to)) return { status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } };
        const id = `t${++n}`;
        ticketTo.set(id, m.to);
        return { status: "ok", id };
      });
      return Response.json({ data });
    }
    const ids = (body as { ids: string[] }).ids;
    return Response.json({
      data: Object.fromEntries(ids.map((id) => [id, dead.receipts?.includes(ticketTo.get(id)!) ? { status: "error", details: { error: "DeviceNotRegistered" } } : { status: "ok" }])),
    });
  });
  const messages = () => calls.filter((c) => c.url.endsWith("/send")).flatMap((c) => c.body as Message[]);
  return { fn: fn as unknown as typeof fetch, calls, messages };
}

async function setup(): Promise<Db> {
  const db = await testDb();
  const now = new Date();
  await db.insert(user).values([
    { id: "rajnish", name: "Rajnish", email: "r@example.com", createdAt: now, updatedAt: now },
    { id: "priya", name: "Priya", email: "p@example.com", createdAt: now, updatedAt: now },
  ]);
  state.db = db;
  return db;
}

const tokens = async (db: Db) => (await db.select().from(pushToken)).map((t) => t.token).sort();
const json = (method: string, body: unknown) => new Request("http://localhost/api/push-tokens", { method, body: JSON.stringify(body) });

async function newSong(db: Db, status: "completed" | "failed" | "running") {
  const s = await createSong(db, { userId: "rajnish", title: "Baarish wali chai", genre: "pop", language: "hi", lyrics: "la la", durationSec: 60 });
  await updateSong(db, s.id, { status, outputPath: status === "completed" ? "/tmp/s.mp3" : null });
  return s;
}

beforeEach(() => {
  state.userId = null;
  vi.unstubAllGlobals();
});

describe("push sender", () => {
  it("writes each phone's message in its own language, with the access token", async () => {
    const db = await setup();
    await savePushToken(db, "rajnish", PHONE, { platform: "ios", lang: "hi" });
    await savePushToken(db, "rajnish", PHONE_2, { platform: "ios" });
    const expo = fakeExpo();
    const sent = await sendPush(db, ["rajnish"], (lang) => ({ ...songReadyText(lang, "Chai"), path: "/songs/1", kind: "songs" }), expo.fn, { ...NO_RECEIPTS, accessToken: "secret" });
    expect(sent).toBe(2);
    expect(expo.calls[0].auth).toBe("Bearer secret");
    expect(expo.messages()).toEqual(
      expect.arrayContaining([
        { to: PHONE, title: "आपका गाना तैयार है", body: '"Chai" सुनने के लिए तैयार है।', data: { path: "/songs/1" }, sound: "default" },
        { to: PHONE_2, title: "Your song is ready", body: '"Chai" is ready to play.', data: { path: "/songs/1" }, sound: "default" },
      ]),
    );
  });

  it("skips people who turned that kind off; pushes without a kind always go", async () => {
    const db = await setup();
    await savePushToken(db, "rajnish", PHONE);
    await savePushToken(db, "priya", PHONE_2);
    await setPushPrefs(db, "rajnish", { gifts: false });
    const expo = fakeExpo();
    expect(await sendPush(db, ["rajnish", "priya"], { title: "t", body: "b", path: "/inbox", kind: "gifts" }, expo.fn, NO_RECEIPTS)).toBe(1);
    expect(expo.messages().map((m) => m.to)).toEqual([PHONE_2]);
    expect(await sendPush(db, ["rajnish"], { title: "t", body: "b", path: "/inbox" }, expo.fn, NO_RECEIPTS)).toBe(1);
  });

  it("drops tokens Expo reports as not registered, in tickets and in receipts", async () => {
    const db = await setup();
    const third = "ExponentPushToken[cccccccccccccccc]";
    for (const t of [PHONE, PHONE_2, third]) await savePushToken(db, "rajnish", t);
    const expo = fakeExpo({ tickets: [PHONE], receipts: [PHONE_2] });
    await sendPush(db, ["rajnish"], { title: "t", body: "b", path: "/" }, expo.fn, { receiptDelayMs: 0 });
    expect(await tokens(db)).toEqual([third]);
    expect(expo.calls.map((c) => c.url)).toEqual(["https://exp.host/--/api/v2/push/send", "https://exp.host/--/api/v2/push/getReceipts"]);
  });
});

describe("push triggers", () => {
  it("song ready and song failed open the song; a song still being made says nothing", async () => {
    const db = await setup();
    await savePushToken(db, "rajnish", PHONE);
    const expo = fakeExpo();
    const ok = await newSong(db, "completed");
    const bad = await newSong(db, "failed");
    const making = await newSong(db, "running");
    expect(await notifySong(db, ok.id, expo.fn, NO_RECEIPTS)).toBe(1);
    expect(await notifySong(db, bad.id, expo.fn, NO_RECEIPTS)).toBe(1);
    expect(await notifySong(db, making.id, expo.fn, NO_RECEIPTS)).toBe(0);
    expect(expo.messages()).toMatchObject([
      { title: "Your song is ready", data: { path: `/songs/${ok.id}` } },
      { title: "Your song didn't work", data: { path: `/songs/${bad.id}` } },
    ]);
  });

  it("respects the Songs switch", async () => {
    const db = await setup();
    await savePushToken(db, "rajnish", PHONE);
    await setPushPrefs(db, "rajnish", { songs: false });
    const expo = fakeExpo();
    expect(await notifySong(db, (await newSong(db, "completed")).id, expo.fn, NO_RECEIPTS)).toBe(0);
    expect(expo.calls).toHaveLength(0);
  });

  it("reel ready opens the reel; a failed reel opens its making screen (Arabic phone)", async () => {
    const db = await setup();
    await savePushToken(db, "rajnish", PHONE, { lang: "ar" });
    const expo = fakeExpo();
    const ok = await createFilm(db, { userId: "rajnish", story: "A story long enough", style: "animated", durationSec: 30 });
    await updateFilm(db, ok.id, { status: "completed", title: "Chai time" });
    const bad = await createFilm(db, { userId: "rajnish", story: "A story long enough", style: "animated", durationSec: 30 });
    await updateFilm(db, bad.id, { status: "failed" });
    await notifyReel(db, ok.id, expo.fn, NO_RECEIPTS);
    await notifyReel(db, bad.id, expo.fn, NO_RECEIPTS);
    expect(expo.messages()).toMatchObject([
      { title: "مقطعك جاهز", body: "«Chai time» جاهز للنشر.", data: { path: `/reel/${ok.id}` } },
      { title: "تعذّر إنشاء مقطعك", data: { path: `/making/${bad.id}` } },
    ]);
  });

  it("never throws when Expo is down", async () => {
    const db = await setup();
    await savePushToken(db, "rajnish", PHONE);
    const down = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await notifySong(db, (await newSong(db, "completed")).id, down, NO_RECEIPTS)).toBe(0);
    expect(await tokens(db)).toEqual([PHONE]);
    err.mockRestore();
  });

  it("the gift page pushes on the first open only: not per play, not for the sender's own visit", async () => {
    const db = await setup();
    await savePushToken(db, "rajnish", PHONE);
    const s = await newSong(db, "completed");
    const g = await insertGift(db, { songId: s.id, senderId: "rajnish", toName: "Priya", occasion: "birthday" });
    const expo = fakeExpo();
    vi.stubGlobal("fetch", expo.fn);
    const event = (type: string) =>
      eventRoute.POST(new Request(`http://localhost/api/g/${g.token}/event`, { method: "POST", body: JSON.stringify({ type }) }), { params: Promise.resolve({ token: g.token }) });

    state.userId = "rajnish";
    expect((await event("open")).status).toBe(204);
    state.userId = null;
    await event("play");
    await event("open");
    await event("play");
    await vi.waitFor(() => expect(expo.messages()).toHaveLength(1));
    expect(expo.messages()[0]).toMatchObject({ title: "Priya opened your gift", body: "Your birthday song has been played.", data: { path: "/inbox" } });
  });

  it("a repeat open doesn't count as a play", async () => {
    const db = await setup();
    const s = await newSong(db, "completed");
    const g = await insertGift(db, { songId: s.id, senderId: "rajnish", toName: "Priya", occasion: "eid" });
    vi.stubGlobal("fetch", fakeExpo().fn);
    for (let i = 0; i < 3; i++)
      await eventRoute.POST(new Request(`http://localhost/api/g/${g.token}/event`, { method: "POST", body: JSON.stringify({ type: "open" }) }), { params: Promise.resolve({ token: g.token }) });
    const { listGifts } = await import("@/lib/gifts");
    const [row] = (await listGifts(db, "rajnish")).sent;
    expect(row.gift.openedAt).not.toBeNull();
    expect(row.gift.playCount).toBe(0);
  });
});

describe("push routes", () => {
  it("saves a token with its platform and language, and moves it to whoever signs in last", async () => {
    const db = await setup();
    expect((await tokensRoute.POST(json("POST", { token: PHONE }))).status).toBe(401);
    state.userId = "rajnish";
    expect((await tokensRoute.POST(json("POST", { token: "nope" }))).status).toBe(400);
    await tokensRoute.POST(json("POST", { token: PHONE, platform: "ios", lang: "hi" }));
    expect((await db.select().from(pushToken))[0]).toMatchObject({ userId: "rajnish", platform: "ios", lang: "hi" });
    state.userId = "priya";
    await tokensRoute.POST(json("POST", { token: PHONE, platform: "ios", lang: "ar" }));
    state.userId = "rajnish";
    await tokensRoute.DELETE(json("DELETE", { token: PHONE }));
    expect((await db.select().from(pushToken))[0]).toMatchObject({ userId: "priya", lang: "ar" });
    state.userId = "priya";
    await tokensRoute.DELETE(json("DELETE", { token: PHONE }));
    expect(await tokens(db)).toEqual([]);
  });

  it("reads and changes which pushes are on", async () => {
    const db = await setup();
    state.userId = "rajnish";
    expect(await (await settingsRoute.GET()).json()).toEqual({ songs: true, reels: true, gifts: true });
    expect(await (await settingsRoute.PUT(json("PUT", { reels: false }))).json()).toEqual({ songs: true, reels: false, gifts: true });
    expect(await getPushPrefs(db, "rajnish")).toEqual({ songs: true, reels: false, gifts: true });
    expect((await settingsRoute.PUT(json("PUT", { reels: "no" }))).status).toBe(400);
  });
});

describe("push copy", () => {
  it("has Hindi and Arabic gift lines, and no occasion word for 'just because'", () => {
    expect(giftOpenedText("hi", "Priya", "birthday").title).toBe("Priya ने आपका तोहफ़ा खोल लिया");
    expect(giftOpenedText("ar", "Priya", "eid").body).toBe("وصلت أغنيتك بمناسبة العيد.");
    expect(giftOpenedText("en", "Priya", "just_because").body).toBe("Your song has been played.");
  });
});
