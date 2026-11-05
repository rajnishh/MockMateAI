import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { createSong, getSongById } from "@/lib/songs/songs";
import { testDb } from "./helpers/db";

// The routes read the signed-in user, the database, env, rate limits and the song safety check;
// the test supplies all of them.
const state = vi.hoisted(() => ({ userId: null as string | null, db: undefined as unknown, check: "pass" as "pass" | "refuse" | "down" }));
vi.mock("@/lib/session", async (original) => ({ ...(await original<object>()), getUserId: async () => state.userId }));
vi.mock("@/lib/db", async (original) => ({ ...(await original<object>()), getDb: () => state.db }));
vi.mock("@/lib/env", async (original) => ({ ...(await original<object>()), loadEnv: () => ({ BETTER_AUTH_URL: "https://reelkar.test" }) }));
vi.mock("@/lib/rate-limit", () => ({ allow: async () => true }));
vi.mock("@/lib/queue/films", () => ({ getRedis: () => ({}) }));
vi.mock("@/lib/ai/engines", () => ({ llmForUser: async () => ({}) }));
vi.mock("@/lib/songs/safety", async (original) => {
  const real = await original<typeof import("@/lib/songs/safety")>();
  return {
    ...real,
    assertNoRealArtists: async () => {
      if (state.check === "refuse") throw new real.SongSafetyError("Songs can't name or imitate real singers.");
      if (state.check === "down") throw new Error("LLM unavailable");
    },
  };
});

const handleRoute = await import("@/app/api/me/handle/route");
const publishRoute = await import("@/app/api/songs/[id]/publish/route");
const songRoute = await import("@/app/api/songs/[id]/route");
const listenRoute = await import("@/app/api/listen/route");
const relatedRoute = await import("@/app/api/listen/related/route");
const publicRoute = await import("@/app/api/listen/songs/[publicId]/route");
const audioRoute = await import("@/app/api/listen/songs/[publicId]/audio/route");
const playRoute = await import("@/app/api/listen/songs/[publicId]/play/route");
const voteRoute = await import("@/app/api/listen/songs/[publicId]/vote/route");
const reactionRoute = await import("@/app/api/listen/songs/[publicId]/reaction/route");
const reportRoute = await import("@/app/api/listen/songs/[publicId]/report/route");

const dir = mkdtempSync(path.join(tmpdir(), "listen-api-"));
const audioFile = path.join(dir, "song.mp3");
writeFileSync(audioFile, "ID3 fake audio");
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let db: Db;
const as = (id: string | null) => (state.userId = id);
const json = (body: unknown, init: RequestInit = {}) => ({ method: "POST", headers: { "Content-Type": "application/json", ...(init.headers ?? {}) }, body: JSON.stringify(body), ...init });
const p = <T extends object>(v: T) => ({ params: Promise.resolve(v) });
const url = (u: string) => `http://app.test${u}`;

async function mySong(userId = "priya", title = "Chai pe charcha") {
  return createSong(db, { userId, title, genre: "pop", mood: "happy", language: "hi", lyrics: "[Verse]\nChai\n\n[Chorus]\nGaram", durationSec: 90, status: "completed", outputPath: audioFile });
}

async function publish(id: string, body: object = {}) {
  return publishRoute.POST(new Request(url(`/api/songs/${id}/publish`), json(body)), p({ id }));
}

// A published song by `userId`, with a handle; returns its public id.
async function publicId(userId = "priya", title?: string): Promise<string> {
  as(userId);
  await handleRoute.PUT(new Request(url("/api/me/handle"), json({ handle: `${userId}.music` }, { method: "PUT" })));
  const s = await mySong(userId, title);
  const res = await publish(s.id);
  return ((await res.json()) as { publicId: string }).publicId;
}

beforeEach(async () => {
  db = await testDb();
  state.db = db;
  state.check = "pass";
  as(null);
  const now = new Date();
  await db.insert(user).values(["priya", "rajnish", "listener"].map((id) => ({ id, name: id === "priya" ? "Priya Sharma" : "Creator 1234", email: `${id}@example.com`, createdAt: now, updatedAt: now })));
});

describe("handle API", () => {
  it("needs sign-in, suggests handles, checks and saves one", async () => {
    expect((await handleRoute.GET(new Request(url("/api/me/handle")))).status).toBe(401);
    as("priya");
    const first = await (await handleRoute.GET(new Request(url("/api/me/handle")))).json();
    expect(first).toMatchObject({ handle: null, suggestions: expect.arrayContaining(["priyasharma"]) });
    expect(await (await handleRoute.GET(new Request(url("/api/me/handle?check=No Spaces")))).json()).toMatchObject({ ok: false, problem: expect.stringMatching(/letters/) });
    const saved = await handleRoute.PUT(new Request(url("/api/me/handle"), json({ handle: "@Priya.Sings" }, { method: "PUT" })));
    expect(await saved.json()).toEqual({ handle: "priya.sings" });
    as("rajnish");
    expect(await (await handleRoute.GET(new Request(url("/api/me/handle?check=priya.sings")))).json()).toMatchObject({ ok: false, problem: expect.stringMatching(/taken/) });
    expect((await handleRoute.PUT(new Request(url("/api/me/handle"), json({ handle: "priya.sings" }, { method: "PUT" })))).status).toBe(409);
  });
});

describe("publish API", () => {
  it("asks for a handle first, then publishes and unpublishes", async () => {
    as("priya");
    const s = await mySong();
    const noHandle = await publish(s.id);
    expect(noHandle.status).toBe(400);
    expect(await noHandle.json()).toMatchObject({ needHandle: true });
    await handleRoute.PUT(new Request(url("/api/me/handle"), json({ handle: "priya.sings" }, { method: "PUT" })));
    const res = await publish(s.id, { title: "Chai time", showLyrics: false });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string; url: string; publicId: string };
    expect(body).toMatchObject({ state: "public", showLyrics: false, url: `https://reelkar.test/s/${body.publicId}` });
    // Song Studio sees it too.
    const own = await (await songRoute.GET(new Request(url(`/api/songs/${s.id}`)), p({ id: s.id }))).json();
    expect(own).toMatchObject({ title: "Chai time", listen: { state: "public", publicId: body.publicId } });

    const off = await publishRoute.DELETE(new Request(url(`/api/songs/${s.id}/publish`), { method: "DELETE" }), p({ id: s.id }));
    expect(await off.json()).toMatchObject({ state: "private", publicId: body.publicId });
    // Everyone else gets 410 for the page and the audio.
    as(null);
    expect((await publicRoute.GET(new Request(url("/")), p({ publicId: body.publicId }))).status).toBe(410);
    expect((await audioRoute.GET(new Request(url("/")), p({ publicId: body.publicId }))).status).toBe(410);
  });

  it("keeps the song private when the safety check refuses or can't run", async () => {
    as("priya");
    await handleRoute.PUT(new Request(url("/api/me/handle"), json({ handle: "priya.sings" }, { method: "PUT" })));
    const s = await mySong();
    state.check = "refuse";
    const refused = await publish(s.id);
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ error: expect.stringMatching(/real singers/) });
    state.check = "down";
    const down = await publish(s.id);
    expect(down.status).toBe(502);
    expect(await down.json()).toMatchObject({ error: expect.stringMatching(/still private/) });
    expect((await getSongById(db, s.id))!.publishedAt).toBeNull();
  });

  it("won't publish someone else's song", async () => {
    const s = await mySong("priya");
    as("rajnish");
    await handleRoute.PUT(new Request(url("/api/me/handle"), json({ handle: "rajnish.music" }, { method: "PUT" })));
    expect((await publish(s.id)).status).toBe(404);
  });
});

describe("public song API", () => {
  it("opens with no sign-in, with audio, rails and no private ids", async () => {
    const id = await publicId("priya");
    await publicId("rajnish", "Another chai song");
    as(null);
    const res = await publicRoute.GET(new Request(url("/")), p({ publicId: id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.song).toMatchObject({ publicId: id, handle: "priya.music", state: "public", myVote: 0, dislikeCount: null });
    expect(body.moreLikeThis).toHaveLength(1);
    const audio = await audioRoute.GET(new Request(url("/")), p({ publicId: id }));
    expect(audio.status).toBe(200);
    expect(audio.headers.get("content-type")).toBe("audio/mpeg");
    expect((await publicRoute.GET(new Request(url("/")), p({ publicId: "nope" }))).status).toBe(404);
  });

  it("counts one play per listener per day: by account, or by browser cookie", async () => {
    const id = await publicId("priya");
    const play = (headers: Record<string, string> = {}) => playRoute.POST(new Request(url("/"), { method: "POST", headers }), p({ publicId: id }));
    as("listener");
    expect(await (await play()).json()).toEqual({ counted: true });
    expect(await (await play()).json()).toEqual({ counted: false });
    as(null);
    const anon = await play();
    expect(await anon.json()).toEqual({ counted: true });
    const cookie = anon.headers.get("set-cookie")!.split(";")[0];
    expect(cookie).toMatch(/^rk_v=/);
    expect(await (await play({ cookie })).json()).toEqual({ counted: false });
    as("priya");
    expect(await (await play()).json()).toEqual({ counted: false });
  });

  it("takes likes, Not for me and reactions from signed-in listeners, not on their own song", async () => {
    const id = await publicId("priya");
    const vote = (value: number) => voteRoute.PUT(new Request(url("/"), json({ value }, { method: "PUT" })), p({ publicId: id }));
    as(null);
    expect((await vote(1)).status).toBe(401);
    as("priya");
    expect((await vote(1)).status).toBe(400);
    as("listener");
    expect((await vote(1)).status).toBe(200);
    expect((await vote(2)).status).toBe(400);
    expect((await reactionRoute.PUT(new Request(url("/"), json({ kind: "fire" }, { method: "PUT" })), p({ publicId: id }))).status).toBe(200);
    expect((await reactionRoute.PUT(new Request(url("/"), json({ kind: "angry" }, { method: "PUT" })), p({ publicId: id }))).status).toBe(400);
    const body = await (await publicRoute.GET(new Request(url("/")), p({ publicId: id }))).json();
    expect(body.song).toMatchObject({ likeCount: 1, myVote: 1, myReaction: "fire" });
  });

  it("takes reports with no sign-in", async () => {
    const id = await publicId("priya");
    as(null);
    const ok = await reportRoute.POST(new Request(url("/"), json({ reason: "voice_or_likeness", details: "That's my voice" })), p({ publicId: id }));
    expect(ok.status).toBe(201);
    expect((await reportRoute.POST(new Request(url("/"), json({ reason: "boring" })), p({ publicId: id }))).status).toBe(400);
    expect(await db.query.songReport.findMany()).toHaveLength(1);
  });
});

describe("Listen and Autoplay API", () => {
  it("lists rails for signed-in people and filters by language", async () => {
    await publicId("priya");
    as(null);
    expect((await listenRoute.GET(new Request(url("/api/listen")))).status).toBe(401);
    as("listener");
    const home = await (await listenRoute.GET(new Request(url("/api/listen")))).json();
    expect(home.new).toHaveLength(1);
    expect(home.languages).toEqual([{ code: "hi", name: "Hindi", native: "हिन्दी", count: 1 }]);
    const ar = await (await listenRoute.GET(new Request(url("/api/listen?lang=ar")))).json();
    expect(ar.new).toEqual([]);
  });

  it("gives related songs, skipping the excluded ones and the listener's own", async () => {
    const a = await publicId("priya", "A");
    const b = await publicId("rajnish", "B");
    as("rajnish");
    const res = await relatedRoute.GET(new Request(url(`/api/listen/related?seed=${a}`)));
    expect((await res.json()).songs).toEqual([]);
    as("listener");
    const both = await (await relatedRoute.GET(new Request(url(`/api/listen/related?seed=${a}`)))).json();
    expect(both.songs.map((x: { publicId: string }) => x.publicId)).toEqual([b]);
    const none = await (await relatedRoute.GET(new Request(url(`/api/listen/related?seed=${a}&exclude=${b}`)))).json();
    expect(none.songs).toEqual([]);
    expect((await relatedRoute.GET(new Request(url("/api/listen/related?limit=99")))).status).toBe(400);
  });
});
