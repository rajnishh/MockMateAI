import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db";
import { film, scheduledPost, user } from "@/lib/db/schema";
import { saveCharacter } from "@/lib/characters";
import { createFilm, seriesEpisodes, updateFilm } from "@/lib/films";
import { createPost } from "@/lib/posts";
import { saveYouTubeAccount } from "@/lib/social-accounts";
import { testDb } from "./helpers/db";

// The route reads the signed-in user, the database and OUTPUT_DIR; the test supplies all three.
const state = vi.hoisted(() => ({ userId: null as string | null, db: undefined as unknown, outputDir: "" }));
vi.mock("@/lib/session", async (original) => ({ ...(await original<object>()), getUserId: async () => state.userId }));
vi.mock("@/lib/db", async (original) => ({ ...(await original<object>()), getDb: () => state.db }));
vi.mock("@/lib/env", async (original) => ({ ...(await original<object>()), loadEnv: () => ({ OUTPUT_DIR: state.outputDir }) }));

const { DELETE } = await import("@/app/api/films/[id]/route");

const outputDir = mkdtempSync(path.join(tmpdir(), "delete-film-"));
afterAll(() => rmSync(outputDir, { recursive: true, force: true }));

let db: Db;

async function del(id: string) {
  return DELETE(new Request(`http://app.test/api/films/${id}`, { method: "DELETE" }), { params: Promise.resolve({ id }) });
}

// A finished reel with its worker folder, an uploaded source and a scheduled post.
async function finishedReel(status: "completed" | "failed" | "running" = "completed") {
  const f = await createFilm(db, { userId: "u1", story: "A story long enough", style: "animated", durationSec: 30 });
  const dir = path.join(outputDir, f.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "final.mp4"), "video");
  mkdirSync(path.join(outputDir, "uploads"), { recursive: true });
  writeFileSync(path.join(outputDir, "uploads", `${f.id}.mp4`), "source");
  await updateFilm(db, f.id, { status: "completed", outputPath: path.join(dir, "final.mp4") });
  const account = await saveYouTubeAccount(db, randomBytes(32).toString("base64"), "u1", { id: `UC-${f.id}`, title: "My Channel" }, {
    accessToken: "a",
    refreshToken: "r",
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  await createPost(db, "u1", { filmId: f.id, socialAccountId: account.id, title: "Ep", description: "", tags: [], privacy: "public" });
  if (status !== "completed") await updateFilm(db, f.id, { status });
  return { id: f.id, dir };
}

describe("DELETE /api/films/:id", () => {
  beforeEach(async () => {
    db = await testDb();
    state.db = db;
    state.outputDir = outputDir;
    state.userId = "u1";
    const now = new Date();
    await db.insert(user).values([
      { id: "u1", name: "One", email: "one@example.com", createdAt: now, updatedAt: now },
      { id: "u2", name: "Two", email: "two@example.com", createdAt: now, updatedAt: now },
    ]);
  }, 30_000);

  it("removes the reel, its scheduled posts and its files", async () => {
    const reel = await finishedReel();
    const res = await del(reel.id);
    expect(res.status).toBe(204);
    expect(await db.select().from(film).where(eq(film.id, reel.id))).toHaveLength(0);
    expect(await db.select().from(scheduledPost).where(eq(scheduledPost.filmId, reel.id))).toHaveLength(0);
    expect(existsSync(reel.dir)).toBe(false);
    expect(existsSync(path.join(outputDir, "uploads", `${reel.id}.mp4`))).toBe(false);
  });

  it("deletes a failed reel", async () => {
    const reel = await finishedReel("failed");
    expect((await del(reel.id)).status).toBe(204);
  });

  it("only lets the owner delete, and needs sign-in", async () => {
    const reel = await finishedReel();
    state.userId = "u2";
    expect((await del(reel.id)).status).toBe(404);
    state.userId = null;
    expect((await del(reel.id)).status).toBe(401);
    expect(await db.select().from(film).where(eq(film.id, reel.id))).toHaveLength(1);
    expect(existsSync(reel.dir)).toBe(true);
  });

  it("keeps a reel that is still being made or posted", async () => {
    const making = await finishedReel("running");
    expect((await del(making.id)).status).toBe(409);
    const posting = await finishedReel();
    await db.update(scheduledPost).set({ status: "publishing" }).where(eq(scheduledPost.filmId, posting.id));
    expect((await del(posting.id)).status).toBe(409);
    expect(existsSync(posting.dir)).toBe(true);
  });

  it("answers 404 for an id that isn't a reel", async () => {
    expect((await del("not-a-uuid")).status).toBe(404);
  });
});

describe("series episodes", () => {
  it("lists a character's own finished episodes, newest first, without failed ones", async () => {
    const c = await saveCharacter(db, "u1", { id: crypto.randomUUID(), name: "Mia", description: "toddler", style: "animated", referenceImageUrl: "file:///ref.jpg", seed: 7 });
    const ep = async (title: string, status: "completed" | "failed", userId = "u1") => {
      const f = await createFilm(db, { userId, characterId: c.id, story: `${title} story`, style: "animated", durationSec: 30 });
      await updateFilm(db, f.id, { status, title, createdAt: new Date(Date.now() + (title === "Kite day" ? 1000 : 0)) });
    };
    await ep("Rainy day", "completed");
    await ep("Broken", "failed");
    await ep("Kite day", "completed");
    expect(await seriesEpisodes(db, "u1", c.id)).toEqual(["Kite day: Kite day story", "Rainy day: Rainy day story"]);
    expect(await seriesEpisodes(db, "u2", c.id)).toEqual([]);
  });
});
