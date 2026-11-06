import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getBalance, grantCredits, spendCredits } from "@/lib/billing/credits";
import { earningTotals } from "@/lib/billing/earnings";
import type { Db } from "@/lib/db";
import { creatorEarning, creatorProfile, film, recipe, recipeReport, recipeUse, user } from "@/lib/db/schema";
import { daysUntil, FESTIVALS, findFestival, inWindow, nearFestivals, orderFestivals, regionFor } from "@/lib/festivals";
import { createFilm, type Film } from "@/lib/films";
import { buildScriptPrompt } from "@/lib/pipeline/script";
import { recipeUsedText } from "@/lib/push-copy";
import { applyRecipe, buildRecipeSpec, checkShape, type RecipeShape, RecipeLockError, ShapeError } from "@/lib/recipe-spec";
import { draftRecipe, listRecipes, makerEarns, publicRecipe, publicRecipeView, publishRecipe, recipeReelFailed, recipeReelFinished, recipeStarted, setRecipeSharing, spreadMakers, takeDownRecipe, type RecipeFiles } from "@/lib/recipes";
import { testDb } from "./helpers/db";

// Routes read the signed-in user, the database, env, the queue and the quota; the test supplies them.
const state = vi.hoisted(() => ({ userId: null as string | null, db: undefined as unknown, queued: [] as unknown[], free: true, outputDir: "" }));
vi.mock("@/lib/session", async (original) => ({ ...(await original<object>()), getUserId: async () => state.userId }));
vi.mock("@/lib/db", async (original) => ({ ...(await original<object>()), getDb: () => state.db }));
vi.mock("@/lib/env", async (original) => ({
  ...(await original<object>()),
  loadEnv: () => ({ BETTER_AUTH_URL: "https://reelkar.test", OUTPUT_DIR: state.outputDir, FREE_FILMS_PER_WEEK: 3, CINEMATIC_VIDEO_MODEL: "kling", FAL_KEY: "test" }),
}));
vi.mock("@/lib/queue/films", async (original) => ({
  ...(await original<object>()),
  getRedis: () => ({ get: async () => (state.free ? "0" : "3") }),
  getFilmQueue: () => ({ add: async (...args: unknown[]) => state.queued.push(args) }),
}));
vi.mock("@/lib/quota/quota", () => ({
  RedisQuotaStore: class {},
  reserveFilm: async () => (state.free ? { ok: true, key: "quota:test" } : { ok: false, reason: "used" }),
}));
vi.mock("@/lib/providers", async (original) => ({
  ...(await original<object>()),
  buildTts: () => ({ supports: () => true }),
  premiumAvailable: () => true,
  cinematicAvailable: () => true,
  danceSongAvailable: () => true,
}));
vi.mock("@/lib/rate-limit", () => ({ allow: async () => true }));

const filmsRoute = await import("@/app/api/films/route");
const publicRoute = await import("@/app/api/recipes/public/[publicId]/route");
const reportRoute = await import("@/app/api/recipes/public/[publicId]/report/route");
const earningsRoute = await import("@/app/api/me/earnings/route");
const detailRoute = await import("@/app/api/me/earnings/[subjectRef]/route");

const out = mkdtempSync(path.join(tmpdir(), "recipes-"));
state.outputDir = out;
afterAll(() => rmSync(out, { recursive: true, force: true }));

let db: Db;
const as = (id: string | null) => (state.userId = id);
const p = <T extends object>(v: T) => ({ params: Promise.resolve(v) });
const url = (u: string) => `http://app.test${u}`;
const post = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// A story script full of the maker's own words and names: none of it may reach a recipe.
const SCRIPT = {
  title: "Meera Ki Diwali Mithai",
  language: "hi",
  characters: [{ name: "Meera Sharma", description: "a girl in a yellow kurta" }, { name: "Bholu", description: "a fluffy dog" }],
  shots: [
    { narration: "Meera ne Sharma Sweets se 12 laddoo churaye", imagePrompt: "Meera Sharma at Sharma Sweets in Jaipur", motionPrompt: "slow push-in" },
    { narration: "Bholu ne sab dekh liya", imagePrompt: "Bholu the dog watching", motionPrompt: "pan left to right" },
    { narration: "Mummy aa gayi!", imagePrompt: "mother at the door", motionPrompt: "quick zoom" },
    { narration: "Sabne milkar laddoo khaye", imagePrompt: "family eating sweets", motionPrompt: "pull back" },
  ],
  musicPrompt: "warm festive sitar and tabla, 95 bpm, instrumental",
};
const SECRETS = ["Meera", "Sharma", "Bholu", "laddoo", "Jaipur", "churaye", "Mithai", "kurta", "yellow", "Mummy"];

const SHAPE: RecipeShape = {
  tone: "warm",
  pace: "quick",
  shots: [
    { role: "hook", intent: "Open on a surprising question about the topic", camera: "slow push-in" },
    { role: "beat", intent: "Show the everyday moment before the change", camera: "pan left to right" },
    { role: "turn", intent: "Something unexpected happens", camera: "quick zoom" },
    { role: "payoff", intent: "A warm ending that answers the opening question", camera: "pull back" },
  ],
};
const fakeLlm = (reply: unknown) => ({ modelId: "test", writeScript: async () => SCRIPT as never, completeJson: async () => reply });
const noFiles: RecipeFiles = async ({ dir, preview, poster }) => {
  mkdirSync(dir, { recursive: true });
  return { previewPath: preview ? path.join(dir, "preview.mp4") : null, posterPath: poster ? path.join(dir, "poster.jpg") : null, musicPath: path.join(dir, "music.m4a") };
};

// A finished story reel by `userId`, with its work dir and script.
async function aReel(userId: string, opts: Partial<Film> = {}): Promise<Film> {
  const f = await createFilm(db, { userId, story: "Meera steals laddoos from Sharma Sweets in Jaipur on Diwali night", style: "animated", durationSec: 20, quality: "premium", credits: 48, status: "completed", outputPath: path.join(out, "x.mp4"), title: "Meera Ki Diwali Mithai", ...opts });
  mkdirSync(path.join(out, f.id), { recursive: true });
  writeFileSync(path.join(out, f.id, "script.json"), JSON.stringify(SCRIPT));
  return f;
}

async function aRecipe(userId = "meera", opts: { occasions?: string[] } = {}) {
  const f = await aReel(userId);
  const draft = await draftRecipe(fakeLlm({ ...SHAPE, topicHint: "A festival memory, your shop, your family" }), f, path.join(out, f.id));
  const r = await publishRecipe(db, { userId, film: f, draft, input: { name: "Diya Night", occasions: opts.occasions ?? ["diwali"], preview: "look" }, outputDir: out, check: async () => undefined, files: noFiles });
  if ("error" in r) throw new Error(r.error);
  return r.recipe;
}

beforeEach(async () => {
  db = await testDb();
  state.db = db;
  state.queued = [];
  state.free = true;
  as(null);
  const now = new Date();
  await db.insert(user).values(["meera", "sana", "roohi"].map((id) => ({ id, name: id, email: `${id}@example.com`, createdAt: now, updatedAt: now })));
  await db.insert(creatorProfile).values(["meera", "sana"].map((id) => ({ userId: id, handle: `${id}.makes` })));
});

describe("what a recipe keeps", () => {
  it("keeps the look, length, shape and music prompt, never the maker's words, names, photo or brand", () => {
    const spec = buildRecipeSpec({ film: { format: "story", style: "animated", durationSec: 20, quality: "premium", kidSafe: false }, script: SCRIPT, shape: SHAPE });
    expect(spec).toMatchObject({ format: "story", style: "animated", durationSec: 20, quality: "premium", shape: SHAPE, musicPrompt: SCRIPT.musicPrompt });
    const text = JSON.stringify(spec).toLowerCase();
    for (const s of SECRETS) expect(text).not.toContain(s.toLowerCase());
    for (const k of ["story", "title", "narration", "characters", "characterId", "photo", "brand", "keyword", "imagePrompt"]) expect(Object.keys(spec)).not.toContain(k);
    expect(text).not.toMatch(/"(narration|imageprompt|characters|title)"/);
  });

  it("keeps a dance reel's looks and moves but not the dancers' names or chant", () => {
    const dance = { title: "Chham chham", language: "hi", bpm: 118, scene: "park", dancers: [{ name: "Aarav", skin: "deep", outfit: "kurta", color: "#ff0000", hair: "short" }], lines: [{ text: "Aarav ki baarish", move: "clap" }, { text: "chham chham", move: "jump" }] };
    const spec = buildRecipeSpec({ film: { format: "dance", style: "animated", durationSec: 30, quality: "standard", kidSafe: true }, script: dance, danceVoice: "chant" });
    expect(spec).toMatchObject({ scene: "park", bpm: 118, moves: ["clap", "jump"], voice: "chant", dancers: [{ skin: "deep", outfit: "kurta", color: "#ff0000", hair: "short" }] });
    expect(JSON.stringify(spec)).not.toMatch(/Aarav|baarish|chham/i);
  });

  it("keeps an edit's options and effect mix, never its words, transcript, keyword or brand", () => {
    const edit = {
      request: { source: "/uploads/me.mp4", watermark: false, voice: "deeper", ending: "comment", keyword: "GUIDE", brand: { handle: "@meera.makes", accent: "#123456" } },
      durationSec: 30,
      hasAudio: true,
      transcript: { text: "Meera here, my secret recipe", words: [] },
      plan: { title: "Meera's secret", zooms: [], cards: [{ type: "point", text: "Secret masala", start: 1, end: 4 }], effects: [{ type: "backdrop", text: "MASALA", start: 5, end: 7 }, { type: "stamp", text: "MYTH", start: 10, end: 12 }] },
      available: { faces: true, mask: true },
      renders: 0,
    };
    const spec = buildRecipeSpec({ film: { format: "edit", style: "animated", durationSec: 30, quality: "standard", kidSafe: false }, edit: edit as never });
    expect(spec).toMatchObject({ format: "edit", voice: "deeper", ending: "comment", mix: { effects: { backdrop: 2, stamp: 2 }, cards: { point: 2 } } });
    expect(JSON.stringify(spec)).not.toMatch(/Meera|GUIDE|MASALA|MYTH|secret|me\.mp4|123456/i);
  });

  it("refuses a music video, and a shape that names the reel's people or has numbers", () => {
    expect(() => buildRecipeSpec({ film: { format: "music", style: "animated", durationSec: 30, quality: "standard", kidSafe: false } })).toThrow();
    expect(() => checkShape({ ...SHAPE, shots: SHAPE.shots.slice(1) }, SCRIPT)).toThrow(ShapeError);
    const named = { ...SHAPE, shots: SHAPE.shots.map((s, i) => (i === 1 ? { ...s, intent: "Bholu watches quietly" } : s)) };
    expect(() => checkShape(named, SCRIPT)).toThrow(ShapeError);
    const numbered = { ...SHAPE, shots: SHAPE.shots.map((s, i) => (i === 0 ? { ...s, intent: "Count 3 surprises" } : s)) };
    expect(() => checkShape(numbered, SCRIPT)).toThrow(ShapeError);
    expect(checkShape({ ...SHAPE, topicHint: "Your shop, your family" }, SCRIPT).topicHint).toBe("Your shop, your family");
  });

  it("puts the shape in the story writer's prompt", () => {
    const prompt = buildScriptPrompt({ story: "My chai stall on a rainy day", style: "animated", shotCount: 4, shape: SHAPE });
    expect(prompt).toContain("Shot 1 is the hook: Open on a surprising question about the topic");
    expect(prompt).toContain('shot 4 "pull back"');
  });

  it("drafts once per reel, and stops after two unreadable scripts", async () => {
    const f = await aReel("meera");
    const dir = path.join(out, f.id);
    const draft = await draftRecipe(fakeLlm(SHAPE), f, dir);
    expect(draft).toMatchObject({ suggestedName: "Meera Ki Diwali Mithai", needsPreviewConsent: false });
    // Cached: a second call doesn't ask the AI again.
    expect(await draftRecipe(fakeLlm(null), f, dir)).toEqual(draft);

    const g = await aReel("meera", { photoConsentAt: new Date() });
    const bad = fakeLlm({ ...SHAPE, shots: [] });
    await expect(draftRecipe(bad, g, path.join(out, g.id))).rejects.toThrow(ShapeError);
    await expect(draftRecipe(bad, g, path.join(out, g.id))).rejects.toThrow(ShapeError);
    await expect(draftRecipe(fakeLlm(SHAPE), g, path.join(out, g.id))).rejects.toThrow(/can't be shared as a recipe yet/);
  });
});

describe("Use this recipe", () => {
  const spec = buildRecipeSpec({ film: { format: "story", style: "madhubani", durationSec: 30, quality: "premium", kidSafe: false }, script: SCRIPT, shape: { ...SHAPE, shots: [...SHAPE.shots, SHAPE.shots[1], SHAPE.shots[3]] } });

  it("locks format, look and length; topic, photo, language and quality stay the user's", () => {
    const body = applyRecipe({ recipe: "abc", story: "My chai stall in the rain", language: "ta", quality: "standard", photo: "p1", photoConsent: true }, spec);
    expect(body).toMatchObject({ format: "story", style: "madhubani", durationSec: 30, story: "My chai stall in the rain", language: "ta", quality: "standard", photo: "p1" });
    expect(body.recipe).toBeUndefined();
    // Sending the same locked value is fine.
    expect(() => applyRecipe({ style: "madhubani", durationSec: 30 }, spec)).not.toThrow();
  });

  it("refuses a changed locked value or a ready-made script", () => {
    expect(() => applyRecipe({ style: "warli" }, spec)).toThrow(RecipeLockError);
    expect(() => applyRecipe({ durationSec: 60 }, spec)).toThrow(/length/);
    expect(() => applyRecipe({ format: "motion" }, spec)).toThrow(RecipeLockError);
    expect(() => applyRecipe({ script: SCRIPT }, spec)).toThrow(RecipeLockError);
  });

  it("starts a reel through POST /api/films with the recipe locked, and 410 once sharing stopped", async () => {
    const r = await aRecipe();
    await grantCredits(db, "sana", 150, "purchase", "pay_1");
    as("sana");
    const res = await filmsRoute.POST(new Request(url("/api/films"), post({ recipe: r.publicId, story: "My chai stall on a rainy evening", language: "hi", quality: "premium" })));
    expect(res.status).toBe(202);
    const { id, credits } = await res.json();
    expect(credits).toBe(48);
    const [f] = await db.select().from(film).where(eq(film.id, id));
    expect(f).toMatchObject({ recipeId: r.id, style: "animated", durationSec: 20 });
    const job = (state.queued[0] as [string, { recipe: { shape: RecipeShape; musicPath: string } }])[1];
    expect(job.recipe.shape).toEqual(SHAPE);
    expect(job.recipe.musicPath).toMatch(/music\.m4a$/);

    const locked = await filmsRoute.POST(new Request(url("/api/films"), post({ recipe: r.publicId, story: "My chai stall on a rainy evening", durationSec: 60 })));
    expect(locked.status).toBe(400);

    as("meera");
    await setRecipeSharing(db, "meera", r.publicId, false);
    as("sana");
    const gone = await filmsRoute.POST(new Request(url("/api/films"), post({ recipe: r.publicId, story: "My chai stall on a rainy evening" })));
    expect(gone.status).toBe(410);
    expect((await gone.json()).error).toMatch(/isn't shared any more/);
    // Nothing was charged for the refused ones.
    expect(await getBalance(db, "sana")).toBe(150 - 48);
  });
});

describe("recipe earnings", () => {
  it("earns 10% of the paid share on success: 150 bought + 20 granted, 72 spent is 635 hundredths", async () => {
    const r = await aRecipe();
    await grantCredits(db, "sana", 150, "purchase", "pay_1");
    await grantCredits(db, "sana", 20, "grant", "welcome:sana");
    const f = await aReel("sana", { status: "running", outputPath: null });
    await spendCredits(db, "sana", 72, f.id);
    const use = await recipeStarted(db, r, { filmId: f.id, userId: "sana", credits: 72 });
    const [e] = await db.select().from(creatorEarning);
    expect(e).toMatchObject({ source: "recipe", sourceRef: f.id, subjectRef: r.id, userId: "meera", charged: 72, paidRatioBp: 8823, hundredths: 635, status: "pending" });
    expect(use.earningId).toBe(e.id);
    expect(await getBalance(db, "meera")).toBe(0);

    const done = await recipeReelFinished(db, f.id);
    expect(done?.credited).toBe(6);
    expect(await getBalance(db, "meera")).toBe(6);
    expect(await earningTotals(db, "meera")).toEqual({ totalHundredths: 635, credited: 6, onTheWay: 35 });
    expect((await db.select().from(recipe).where(eq(recipe.id, r.id)))[0].useCount).toBe(1);
    // The same reel never grants twice, and a later failure takes nothing back.
    expect(await recipeReelFinished(db, f.id)).toBeNull();
    await recipeReelFailed(db, f.id);
    expect(await getBalance(db, "meera")).toBe(6);
    expect(recipeUsedText("en", "Diya Night", 635)).toEqual({ title: "Someone made a reel with Diya Night", body: "You earned 6.35 credits." });
  });

  it("drops the earning when the reel fails", async () => {
    const r = await aRecipe();
    await grantCredits(db, "sana", 150, "purchase", "pay_1");
    const f = await aReel("sana", { status: "running" });
    await recipeStarted(db, r, { filmId: f.id, userId: "sana", credits: 72 });
    await recipeReelFailed(db, f.id);
    expect((await db.select().from(creatorEarning))[0].status).toBe("dropped");
    expect((await db.select().from(recipeUse))[0].status).toBe("failed");
    expect(await recipeReelFinished(db, f.id)).toBeNull();
    expect(await getBalance(db, "meera")).toBe(0);
  });

  it("never earns from your own use or a free reel, and own uses don't count as reels made", async () => {
    const r = await aRecipe();
    await grantCredits(db, "meera", 100, "purchase", "pay_m");
    const own = await aReel("meera", { status: "running" });
    await recipeStarted(db, r, { filmId: own.id, userId: "meera", credits: 72 });
    const free = await aReel("sana", { status: "running", credits: 0 });
    await recipeStarted(db, r, { filmId: free.id, userId: "sana", credits: 0 });
    expect(await db.select().from(creatorEarning)).toHaveLength(0);
    await recipeReelFinished(db, own.id);
    await recipeReelFinished(db, free.id);
    expect((await db.select().from(recipe).where(eq(recipe.id, r.id)))[0].useCount).toBe(1);
    expect(await getBalance(db, "meera")).toBe(100);
    expect(makerEarns(72, 10_000, true)).toEqual({ hundredths: 0, kind: "own" });
    expect(makerEarns(0, 10_000, false).kind).toBe("free");
    expect(makerEarns(72, 0, false).kind).toBe("free");
    expect(makerEarns(1, 10_000, false)).toEqual({ hundredths: 10, kind: "small" });
    expect(makerEarns(72, 8823, false)).toEqual({ hundredths: 635, kind: "n" });
  });

  it("drops pending earnings when the recipe is taken down, but a stopped recipe still earns", async () => {
    const r = await aRecipe();
    await grantCredits(db, "sana", 150, "purchase", "pay_1");
    const a = await aReel("sana", { status: "running" });
    const b = await aReel("sana", { status: "running" });
    await recipeStarted(db, r, { filmId: a.id, userId: "sana", credits: 10 });
    await setRecipeSharing(db, "meera", r.publicId, false);
    expect((await recipeReelFinished(db, a.id))?.earning.status).toBe("earned");
    await recipeStarted(db, r, { filmId: b.id, userId: "sana", credits: 10 });
    await takeDownRecipe(db, r.id);
    expect(await recipeReelFinished(db, b.id)).toBeNull();
    expect((await db.select().from(creatorEarning).where(eq(creatorEarning.sourceRef, b.id)))[0].status).toBe("dropped");
  });

  it("shows recipe rows on the shared Earnings screen, anonymous in the detail", async () => {
    const r = await aRecipe();
    await grantCredits(db, "sana", 150, "purchase", "pay_1");
    const paid = await aReel("sana", { status: "running" });
    await recipeStarted(db, r, { filmId: paid.id, userId: "sana", credits: 72 });
    await recipeReelFinished(db, paid.id);
    const free = await aReel("sana", { status: "running", credits: 0 });
    await recipeStarted(db, r, { filmId: free.id, userId: "sana", credits: 0 });
    await recipeReelFinished(db, free.id);
    as("meera");
    const all = await (await earningsRoute.GET(new Request(url("/api/me/earnings?source=recipe")))).json();
    expect(all.bySubject).toEqual([expect.objectContaining({ source: "recipe", subjectRef: r.id, title: "Diya Night", count: 1, hundredths: 720, freeUses: 1, state: "public" })]);
    expect((await (await earningsRoute.GET(new Request(url("/api/me/earnings?source=remix")))).json()).bySubject).toEqual([]);
    const detail = await (await detailRoute.GET(new Request(url(`/api/me/earnings/${r.id}`)), p({ subjectRef: r.id }))).json();
    expect(detail).toMatchObject({ title: "Diya Night", source: "recipe", events: [{ hundredths: 720, free: false, remixerHandle: null }] });
    expect(JSON.stringify(detail)).not.toContain("sana");
  });
});

describe("festival windows", () => {
  const diwali = findFestival("diwali")!;
  it("shows from 21 days before the first day to 2 days after the last", () => {
    expect(inWindow(diwali, new Date("2026-10-17T12:00:00Z"))).toBe(false);
    expect(inWindow(diwali, new Date("2026-10-18T00:00:00Z"))).toBe(true);
    expect(inWindow(diwali, new Date("2026-11-10T23:00:00Z"))).toBe(true);
    expect(inWindow(diwali, new Date("2026-11-11T00:00:00Z"))).toBe(false);
    expect(daysUntil(diwali, new Date("2026-11-06T09:00:00Z"))).toBe(2);
    // All-year collections never show as a festival card.
    expect(inWindow(findFestival("birthday")!, new Date())).toBe(false);
  });

  it("puts Gulf festivals first for Arabic or a Gulf time zone, Indian ones for India", () => {
    const now = new Date("2026-11-20T00:00:00Z");
    expect(regionFor("ar", null)).toBe("gcc");
    expect(regionFor("en", "Asia/Dubai")).toBe("gcc");
    expect(regionFor("hi", "Asia/Kolkata")).toBe("in");
    expect(nearFestivals(now, "gcc").map((f) => f.slug)[0]).toBe("uae-national-day");
    expect(nearFestivals(new Date("2026-11-06T00:00:00Z"), "in")[0].slug).toBe("diwali");
    const both = [findFestival("diwali")!, findFestival("uae-national-day")!];
    expect(orderFestivals(both, "gcc", new Date("2026-11-01T00:00:00Z")).map((f) => f.slug)).toEqual(["uae-national-day", "diwali"]);
    expect(orderFestivals(both, "in", new Date("2026-11-01T00:00:00Z")).map((f) => f.slug)).toEqual(["diwali", "uae-national-day"]);
    expect(FESTIVALS.every((f) => f.featured.length <= 3)).toBe(true);
  });
});

describe("the public recipe", () => {
  it("is public with no sign-in, and says when it was stopped or taken down", async () => {
    const r = await aRecipe();
    const ok = await publicRoute.GET(new Request(url(`/api/recipes/public/${r.publicId}`)), p({ publicId: r.publicId }));
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.recipe).toMatchObject({ name: "Diya Night", handle: "meera.makes", format: "story", previewUrl: null, has: { shape: { first: "hook", middle: 2, last: "payoff" } } });
    expect(JSON.stringify(body)).not.toMatch(/Bholu|laddoo|Sharma/);

    await setRecipeSharing(db, "meera", r.publicId, false);
    const stopped = await publicRoute.GET(new Request(url(`/api/recipes/public/${r.publicId}`)), p({ publicId: r.publicId }));
    expect(stopped.status).toBe(410);
    expect((await stopped.json()).state).toBe("stopped");
    expect(publicRecipeView((await publicRecipe(db, r.publicId))!).recipe).toBeNull();

    await setRecipeSharing(db, "meera", r.publicId, true);
    await takeDownRecipe(db, r.id);
    const removed = await publicRoute.GET(new Request(url(`/api/recipes/public/${r.publicId}`)), p({ publicId: r.publicId }));
    expect(await removed.json()).toMatchObject({ state: "taken_down", error: "This recipe was removed after a report." });
    // A taken-down recipe can't be shared again.
    expect(await setRecipeSharing(db, "meera", r.publicId, true)).toMatchObject({ status: 403 });
  });

  it("prices it for a signed-in user with what the maker earns", async () => {
    const r = await aRecipe();
    await grantCredits(db, "sana", 150, "purchase", "pay_1");
    await grantCredits(db, "sana", 20, "grant", "welcome:sana");
    as("sana");
    const body = await (await publicRoute.GET(new Request(url(`/api/recipes/public/${r.publicId}`)), p({ publicId: r.publicId }))).json();
    expect(body.price).toMatchObject({ quality: "premium", credits: 48, freeLeft: 3 });
    expect(body.makerEarns).toEqual({ hundredths: 423, kind: "n" });
    as("meera");
    const mine = await (await publicRoute.GET(new Request(url(`/api/recipes/public/${r.publicId}`)), p({ publicId: r.publicId }))).json();
    expect(mine).toMatchObject({ mine: true, stats: { useCount: 0, earnedHundredths: 0 } });
    expect(mine.price).toBeUndefined();
  });

  it("takes a Report with no sign-in, never hides it by itself, and hides it for the reporter", async () => {
    const r = await aRecipe();
    const anon = await reportRoute.POST(new Request(url(`/api/recipes/public/${r.publicId}/report`), post({ reason: "copyright", details: "My song" })), p({ publicId: r.publicId }));
    expect(anon.status).toBe(201);
    as("sana");
    expect((await reportRoute.POST(new Request(url("/x"), post({ reason: "nope" })), p({ publicId: r.publicId }))).status).toBe(400);
    expect((await reportRoute.POST(new Request(url("/x"), post({ reason: "hateful" })), p({ publicId: r.publicId }))).status).toBe(201);
    expect(await db.select().from(recipeReport)).toHaveLength(2);
    expect((await publicRecipe(db, r.publicId))!.recipe.takenDownAt).toBeNull();
    expect((await listRecipes(db, {})).map((c) => c.publicId)).toEqual([r.publicId]);
    expect(await listRecipes(db, { viewerId: "sana" })).toEqual([]);
  });

  it("needs a handle to share, and keeps at most 2 per maker in the first of a collection", async () => {
    const f = await aReel("roohi");
    const draft = await draftRecipe(fakeLlm(SHAPE), f, path.join(out, f.id));
    const r = await publishRecipe(db, { userId: "roohi", film: f, draft, input: { name: "Mine", occasions: [], preview: "look" }, outputDir: out, check: async () => undefined, files: noFiles });
    expect(r).toMatchObject({ status: 409, needsHandle: true });
    const cards = ["a", "a", "a", "b"].map((handle, i) => ({ handle, i }));
    expect(spreadMakers(cards, 3).map((c) => c.i)).toEqual([0, 1, 3, 2]);
  });
});
