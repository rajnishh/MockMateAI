import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AVATAR_PRESETS } from "@/lib/avatars";
import type { Db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { isPlaceholderName, myProfile, nameProblem, saveProfile } from "@/lib/profile";
import { createSong } from "@/lib/songs/songs";
import { testDb } from "./helpers/db";

const dir = mkdtempSync(path.join(tmpdir(), "profile-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// The routes read the signed-in user, the database, env and rate limits; the test supplies them.
const state = vi.hoisted(() => ({ userId: null as string | null, db: undefined as unknown, dir: "" }));
state.dir = dir;
vi.mock("@/lib/session", async (original) => ({ ...(await original<object>()), getUserId: async () => state.userId }));
vi.mock("@/lib/db", async (original) => ({ ...(await original<object>()), getDb: () => state.db }));
vi.mock("@/lib/env", async (original) => ({ ...(await original<object>()), loadEnv: () => ({ BETTER_AUTH_URL: "https://reelkar.test", OUTPUT_DIR: state.dir }) }));
vi.mock("@/lib/rate-limit", () => ({ allow: async () => true }));
vi.mock("@/lib/queue/films", () => ({ getRedis: () => ({}) }));
vi.mock("@/lib/ai/engines", () => ({ llmForUser: async () => ({}) }));
vi.mock("@/lib/songs/safety", async (original) => ({ ...(await original<object>()), assertNoRealArtists: async () => undefined }));

const profileRoute = await import("@/app/api/me/profile/route");
const photoRoute = await import("@/app/api/me/profile/photo/route");
const creatorPhotoRoute = await import("@/app/api/listen/creators/[handle]/photo/route");
const publishRoute = await import("@/app/api/songs/[id]/publish/route");
const publicRoute = await import("@/app/api/listen/songs/[publicId]/route");

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("fake png")]);
const url = (u: string) => `http://app.test${u}`;
const put = (body: unknown) => new Request(url("/api/me/profile"), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const p = <T extends object>(v: T) => ({ params: Promise.resolve(v) });
const as = (id: string | null) => (state.userId = id);

function upload(data: Buffer = PNG) {
  const form = new FormData();
  form.append("photo", new File([new Uint8Array(data)], "me.png", { type: "image/png" }));
  return photoRoute.POST(new Request(url("/api/me/profile/photo"), { method: "POST", body: form }));
}

let db: Db;
beforeEach(async () => {
  db = await testDb();
  state.db = db;
  as(null);
  const now = new Date();
  await db.insert(user).values([
    { id: "priya", name: "Priya Sharma", email: "priya@example.com", createdAt: now, updatedAt: now },
    { id: "phone", name: "Creator 4821", email: "4821@phone.reelkar", createdAt: now, updatedAt: now },
  ]);
});

describe("profile rules", () => {
  it("treats the names given at sign-up as not chosen yet", () => {
    expect(isPlaceholderName("Creator 4821")).toBe(true);
    expect(isPlaceholderName("")).toBe(true);
    expect(isPlaceholderName("priya@example.com")).toBe(true);
    expect(isPlaceholderName("Priya Sharma")).toBe(false);
    expect(nameProblem("  ")).toMatch(/Add your name/);
    expect(nameProblem("x".repeat(41))).toMatch(/40/);
    expect(nameProblem("प्रिया")).toBeNull();
  });

  it("keeps the app's avatar list identical to the server's", () => {
    const server = readFileSync("src/lib/avatars.ts", "utf8");
    expect(readFileSync("mobile/src/lib/avatars.ts", "utf8")).toBe(server);
    expect(new Set(AVATAR_PRESETS.map((a) => a.key)).size).toBe(AVATAR_PRESETS.length);
  });
});

describe("profile", () => {
  it("lists what's missing for a new phone sign-up, with handle ideas", async () => {
    const me = await myProfile(db, "phone");
    expect(me).toMatchObject({ name: "", handle: null, avatar: null, complete: false, missing: ["name", "handle", "photo"] });
    expect((await myProfile(db, "priya")).suggestions).toContain("priyasharma");
  });

  it("saves name, handle and a ready-made avatar, and skips empty fields", async () => {
    expect(await saveProfile(db, dir, "phone", { name: "Sana Khan", handle: "@Sana.Sings", avatar: "peacock" })).toEqual({ ok: true });
    expect(await myProfile(db, "phone")).toMatchObject({ name: "Sana Khan", handle: "sana.sings", avatar: { preset: "peacock" }, complete: true, missing: [] });
    // Skipping leaves everything as it was.
    expect(await saveProfile(db, dir, "phone", { name: "", handle: "" })).toEqual({ ok: true });
    expect(await myProfile(db, "phone")).toMatchObject({ name: "Sana Khan", handle: "sana.sings" });
  });

  it("refuses a taken handle before saving anything else", async () => {
    await saveProfile(db, dir, "priya", { handle: "priya.sings" });
    const r = await saveProfile(db, dir, "phone", { name: "Other Priya", handle: "priya.sings", avatar: "mic" });
    expect(r).toMatchObject({ field: "handle", status: 409, error: expect.stringMatching(/taken/) });
    expect(await myProfile(db, "phone")).toMatchObject({ name: "", avatar: null });
    expect(await saveProfile(db, dir, "phone", { avatar: "not-a-preset" })).toMatchObject({ field: "avatar", status: 400 });
  });
});

describe("profile API", () => {
  it("needs sign-in", async () => {
    expect((await profileRoute.GET(new Request(url("/api/me/profile")))).status).toBe(401);
    expect((await profileRoute.PUT(put({ name: "X" }))).status).toBe(401);
    expect((await upload()).status).toBe(401);
  });

  it("saves and returns the profile, naming the field it refused", async () => {
    as("phone");
    const saved = await profileRoute.PUT(put({ name: "Sana Khan", handle: "sana.sings", avatar: "chai" }));
    expect(await saved.json()).toMatchObject({ name: "Sana Khan", handle: "sana.sings", avatar: { preset: "chai" }, complete: true });
    as("priya");
    const ideas = await (await profileRoute.GET(new Request(url("/api/me/profile?suggest=Sana%20Khan")))).json();
    expect(ideas.suggestions).toEqual(expect.arrayContaining(["sana.khan"]));
    const taken = await profileRoute.PUT(put({ handle: "sana.sings" }));
    expect(taken.status).toBe(409);
    expect(await taken.json()).toMatchObject({ field: "handle" });
  });

  it("uploads a photo, serves it, and removes the old file when it's replaced", async () => {
    as("priya");
    expect((await upload(Buffer.from("not an image"))).status).toBe(400);
    const res = await upload();
    expect(res.status).toBe(201);
    const body = (await res.json()) as { avatar: { url: string } };
    expect(body.avatar.url).toMatch(/^\/api\/me\/profile\/photo\?v=\d+$/);
    const own = await photoRoute.GET(new Request(url("/api/me/profile/photo")));
    expect(own.status).toBe(200);
    expect(own.headers.get("Content-Type")).toBe("image/png");
    expect(Buffer.from(await own.arrayBuffer())).toEqual(PNG);

    const photosDir = path.join(dir, "photos");
    const files = () => readdirSync(photosDir, { recursive: true }).filter((f) => String(f).endsWith(".png"));
    expect(files()).toHaveLength(1);
    await upload();
    expect(files()).toHaveLength(1);
    await profileRoute.PUT(put({ avatar: "moon" }));
    expect(files()).toHaveLength(0);
    expect((await photoRoute.GET(new Request(url("/api/me/profile/photo")))).status).toBe(404);
  });
});

describe("Listen uses the saved handle and photo", () => {
  it("publishes without asking for a handle again and shows the photo on the song", async () => {
    as("priya");
    await profileRoute.PUT(put({ handle: "priya.sings" }));
    await upload();
    const audio = path.join(dir, "song.mp3");
    writeFileSync(audio, "ID3 fake audio");
    const s = await createSong(db, { userId: "priya", title: "Chai", genre: "pop", mood: "happy", language: "hi", lyrics: "[Verse]\nChai", durationSec: 90, status: "completed", outputPath: audio });
    const pub = await publishRoute.POST(new Request(url(`/api/songs/${s.id}/publish`), { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }), p({ id: s.id }));
    expect(pub.status).toBe(200);
    const { publicId } = (await pub.json()) as { publicId: string };

    as(null);
    const view = await (await publicRoute.GET(new Request(url("/")), p({ publicId }))).json();
    expect(view.song).toMatchObject({ handle: "priya.sings", creatorAvatar: { url: expect.stringMatching(/^\/api\/listen\/creators\/priya\.sings\/photo\?v=\d+$/) } });
    const photo = await creatorPhotoRoute.GET(new Request(url("/")), p({ handle: "priya.sings" }));
    expect(photo.status).toBe(200);
    expect(photo.headers.get("Cache-Control")).toMatch(/public/);
    // No handle, no public photo.
    as("phone");
    await upload();
    expect((await creatorPhotoRoute.GET(new Request(url("/")), p({ handle: "nobody.here" }))).status).toBe(404);
  });
});
