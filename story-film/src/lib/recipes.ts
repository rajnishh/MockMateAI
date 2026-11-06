import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, notExists, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { EARN_RATE_BP } from "@/lib/billing/catalog";
import { dropEarning, earningHundredths, settleEarning, startEarning, type SubjectInfo } from "@/lib/billing/earnings";
import type { Db } from "@/lib/db";
import { creatorEarning, creatorProfile, film, giftReportReason, recipe, recipeReport, recipeUse } from "@/lib/db/schema";
import type { EditState } from "@/lib/edit/state";
import { defaultFfmpeg } from "@/lib/ffmpeg";
import { FESTIVAL_SLUGS, festivalCalendar, findFestival, nearFestivals, regionFor, upcomingFestivals, daysUntil, nextDates, type Festival } from "@/lib/festivals";
import type { Film } from "@/lib/films";
import { newGiftToken } from "@/lib/gifts";
import { getProfile, PUBLIC_ID } from "@/lib/listen";
import type { LlmProvider } from "@/lib/providers/types";
import { buildRecipeSpec, buildShapePrompt, checkShape, type RecipeSpec, recipeSpecSchema, ShapeError, shapeSummary } from "@/lib/recipe-spec";
import { FILM_STYLES } from "@/lib/styles";

// Reel recipes that earn credits (design/community/recipes-spec.md): share a finished reel's look,
// length, script shape and music; others make their own reel with it, and the maker earns a share
// of the paid credits through the shared earnings model (src/lib/billing/earnings.ts, source
// "recipe": sourceRef = the reel's film id, subjectRef = the recipe id).

export type Recipe = typeof recipe.$inferSelect;
export type RecipeFormat = Recipe["format"];

// ---------- Can this reel be shared? ----------

export type NotEligible = "notFinished" | "musicVideo" | "fromRecipe" | "cantRead";

export function recipeBlock(f: Film): NotEligible | null {
  if (f.status !== "completed" || !f.outputPath) return "notFinished";
  if (f.songId) return "musicVideo";
  if (f.recipeId) return "fromRecipe";
  return null;
}

// Reels that show a real person: made with a photo, a saved character, or the maker's own video.
export const showsPeople = (f: Pick<Film, "photoConsentAt" | "characterId" | "format">) => Boolean(f.photoConsentAt || f.characterId || f.format === "edit");

// ---------- Draft ----------

export interface RecipeDraft {
  spec: RecipeSpec;
  topicHint: string;
  languageHint: string | null;
  suggestedName: string;
  needsPreviewConsent: boolean;
}

const DRAFT_FILE = "recipe-draft.json";
// After this many unreadable shapes the card says "This reel can't be shared as a recipe yet".
export const MAX_DRAFT_FAILS = 2;

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8"));
}

// The share sheet's draft, made once per reel and kept in its work dir. Story reels ask the text AI
// for the script shape; the other formats read their saved script or plan. Throws ShapeError when
// the reel's script can't be turned into a recipe (counted, up to MAX_DRAFT_FAILS).
export async function draftRecipe(llm: LlmProvider, f: Film, workDir: string, appLang = "en"): Promise<RecipeDraft> {
  const file = path.join(workDir, DRAFT_FILE);
  const saved = (await readJson(file).catch(() => null)) as { draft?: RecipeDraft; fails?: number } | null;
  if (saved?.draft) return saved.draft;
  if ((saved?.fails ?? 0) >= MAX_DRAFT_FAILS) throw new ShapeError("This reel can't be shared as a recipe yet.");
  try {
    const draft = await buildDraft(llm, f, workDir, appLang);
    await writeFile(file, JSON.stringify({ draft }));
    return draft;
  } catch (err) {
    await writeFile(file, JSON.stringify({ fails: (saved?.fails ?? 0) + 1 })).catch(() => undefined);
    throw err instanceof ShapeError ? err : new ShapeError((err as Error).message);
  }
}

async function buildDraft(llm: LlmProvider, f: Film, workDir: string, appLang: string): Promise<RecipeDraft> {
  const filmInfo = { format: f.format, style: f.style, durationSec: f.durationSec, quality: f.quality, kidSafe: f.kidSafe };
  let topicHint = "";
  let spec: RecipeSpec;
  let languageHint: string | null = null;
  if (f.format === "edit") {
    const edit = (await readJson(path.join(workDir, "edit.json"))) as EditState;
    spec = buildRecipeSpec({ film: filmInfo, edit });
    languageHint = edit.transcript.language ?? null;
  } else {
    const script = (await readJson(path.join(workDir, "script.json"))) as { title?: string; language?: string; characters?: { name: string }[]; shots?: { narration: string; motionPrompt: string }[] };
    languageHint = script.language ?? null;
    if (f.format === "story") {
      if (!script.shots?.length) throw new ShapeError("Couldn't read this reel's script.");
      const checked = checkShape(await llm.completeJson(buildShapePrompt({ shots: script.shots }, appLang)), { title: script.title, characters: script.characters, shots: script.shots });
      topicHint = checked.topicHint;
      spec = buildRecipeSpec({ film: filmInfo, script, shape: checked.shape, intentI18n: checked.intentDisplay ? { [appLang]: checked.intentDisplay } : {} });
    } else {
      const timing = (await readJson(path.join(workDir, "timing.json")).catch(() => null)) as { voice?: "sung" | "chant" | "ai_song" } | null;
      spec = buildRecipeSpec({ film: filmInfo, script, danceVoice: timing?.voice });
    }
  }
  return { spec, topicHint, languageHint, suggestedName: (f.title ?? "").slice(0, 40), needsPreviewConsent: showsPeople(f) };
}

// ---------- Files ----------

export type RecipeFiles = (input: { video: string; workDir: string; dir: string; preview: boolean; poster: boolean }) => Promise<{ previewPath: string | null; posterPath: string | null; musicPath: string | null }>;

// Copied at publish into OUTPUT_DIR/recipes/<id>/, so the recipe outlives the reel: a 480p preview
// of at most 15 s, a poster frame, and the reel's background track.
export function ffmpegRecipeFiles(ffmpeg: (args: string[]) => Promise<void> = defaultFfmpeg): RecipeFiles {
  return async ({ video, workDir, dir, preview, poster }) => {
    await mkdir(dir, { recursive: true });
    const out = { previewPath: null as string | null, posterPath: null as string | null, musicPath: null as string | null };
    if (preview) {
      out.previewPath = path.join(dir, "preview.mp4");
      await ffmpeg(["-y", "-i", video, "-t", "15", "-vf", "scale=480:-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", out.previewPath]);
    }
    if (poster) {
      out.posterPath = path.join(dir, "poster.jpg");
      await ffmpeg(["-y", "-ss", "1", "-i", video, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4", out.posterPath]);
    }
    const track = path.join(workDir, "music.wav");
    if (await stat(track).catch(() => null)) {
      out.musicPath = path.join(dir, "music.m4a");
      await ffmpeg(["-y", "-i", track, "-c:a", "aac", "-b:a", "128k", out.musicPath]);
    }
    return out;
  };
}

// ---------- Publish ----------

export const shareSchema = z.object({
  name: z.string().trim().min(1, "Give your recipe a name").max(40),
  occasions: z.array(z.enum(FESTIVAL_SLUGS as [string, ...string[]])).max(2).default([]),
  preview: z.enum(["reel", "look"]).default("look"),
});

export const recipeUrl = (base: string, publicId: string) => `${base}/r/${publicId}`;

// Shares the maker's finished reel as a recipe, or shares it again. `check` runs the existing text
// safety check on the name and the shape and throws to stop it; nothing is shared then.
export async function publishRecipe(
  db: Db,
  args: { userId: string; film: Film; draft: RecipeDraft; input: z.infer<typeof shareSchema>; outputDir: string; check: (texts: string[]) => Promise<void>; files: RecipeFiles },
  now = new Date(),
): Promise<{ recipe: Recipe } | { error: string; status: number; needsHandle?: boolean }> {
  const { userId, film: f, draft, input } = args;
  const block = recipeBlock(f);
  if (block) return { error: BLOCK_TEXT[block], status: 400 };
  if (!(await getProfile(db, userId))) return { error: "Pick your @name first.", status: 409, needsHandle: true };
  const [existing] = await db.select().from(recipe).where(eq(recipe.sourceFilmId, f.id));
  if (existing?.takenDownAt) return { error: "This recipe was removed after a report, so it can't be shared again.", status: 403 };
  const shape = draft.spec.format === "story" ? draft.spec.shape.shots.flatMap((s) => [s.intent, s.camera]) : [];
  await args.check([input.name, draft.topicHint, ...shape]);
  // A reel that shows people previews only with the maker's say-so (the switch in the sheet).
  const previewKind = input.preview;
  const id = existing?.id ?? crypto.randomUUID();
  const dir = path.resolve(args.outputDir, "recipes", id);
  const files = await args.files({ video: f.outputPath!, workDir: path.resolve(args.outputDir, f.id), dir, preview: previewKind === "reel", poster: previewKind === "reel" || !draft.needsPreviewConsent });
  const values = {
    name: input.name,
    occasions: input.occasions,
    spec: draft.spec,
    topicHint: draft.topicHint,
    languageHint: draft.languageHint,
    quality: f.quality,
    durationSec: draft.spec.durationSec,
    kidSafe: f.format === "dance" || f.kidSafe,
    previewKind,
    ...files,
    publishedAt: now,
    unpublishedAt: null,
  };
  if (existing) {
    const [row] = await db.update(recipe).set(values).where(eq(recipe.id, existing.id)).returning();
    return { recipe: row };
  }
  for (let i = 0; ; i++) {
    try {
      const [row] = await db
        .insert(recipe)
        .values({ id, publicId: newGiftToken(), makerId: userId, sourceFilmId: f.id, format: f.format, ...values })
        .returning();
      return { recipe: row };
    } catch (err) {
      if (i >= 4 || !/public_id|unique/i.test(String((err as { cause?: unknown }).cause ?? err))) throw err;
    }
  }
}

export const BLOCK_TEXT: Record<NotEligible, string> = {
  notFinished: "Only a finished reel can be shared as a recipe.",
  musicVideo: "Music videos can't be shared as recipes yet.",
  fromRecipe: "This reel was made from someone's recipe, so it can't be shared as one.",
  cantRead: "This reel can't be shared as a recipe yet.",
};

async function ownRecipe(db: Db, userId: string, publicId: string): Promise<Recipe | undefined> {
  if (!PUBLIC_ID.test(publicId)) return undefined;
  const [row] = await db.select().from(recipe).where(and(eq(recipe.publicId, publicId), eq(recipe.makerId, userId)));
  return row;
}

// Stop sharing (it leaves Recipes and its link stops working) or share again.
export async function setRecipeSharing(db: Db, userId: string, publicId: string, on: boolean, now = new Date()): Promise<Recipe | { error: string; status: number }> {
  const r = await ownRecipe(db, userId, publicId);
  if (!r) return { error: "Recipe not found", status: 404 };
  if (on && r.takenDownAt) return { error: "This recipe was removed after a report, so it can't be shared again.", status: 403 };
  const [row] = await db
    .update(recipe)
    .set(on ? { publishedAt: now, unpublishedAt: null } : { publishedAt: null, unpublishedAt: now })
    .where(eq(recipe.id, r.id))
    .returning();
  return row;
}

export const editRecipeSchema = shareSchema.pick({ name: true, occasions: true }).partial();

// Edit name and festival; the name goes through the safety check again.
export async function editRecipe(db: Db, userId: string, publicId: string, input: z.infer<typeof editRecipeSchema>, check: (texts: string[]) => Promise<void>): Promise<Recipe | { error: string; status: number }> {
  const r = await ownRecipe(db, userId, publicId);
  if (!r) return { error: "Recipe not found", status: 404 };
  if (input.name && input.name !== r.name) await check([input.name]);
  const [row] = await db.update(recipe).set(input).where(eq(recipe.id, r.id)).returning();
  return row;
}

// A report was upheld (the owner, by hand): the recipe goes, and reels making with it now earn nothing.
export async function takeDownRecipe(db: Db, id: string, now = new Date()): Promise<void> {
  await db.update(recipe).set({ takenDownAt: now }).where(eq(recipe.id, id));
  const pending = await db.select({ ref: creatorEarning.sourceRef }).from(creatorEarning).where(and(eq(creatorEarning.source, "recipe"), eq(creatorEarning.subjectRef, id), eq(creatorEarning.status, "pending")));
  for (const p of pending) await dropEarning(db, "recipe", p.ref, now);
}

// The maker's reel is being deleted and they chose "Delete reel and recipe". Found before the reel
// goes (its recipe's link to it is cleared then); the returned function stops it once it's gone.
export async function stopRecipeForFilm(db: Db, userId: string, filmId: string): Promise<() => Promise<void>> {
  const [r] = await db.select({ id: recipe.id }).from(recipe).where(and(eq(recipe.sourceFilmId, filmId), eq(recipe.makerId, userId)));
  return async () => {
    if (r) await db.update(recipe).set({ publishedAt: null, unpublishedAt: new Date() }).where(eq(recipe.id, r.id));
  };
}

// ---------- Public recipes ----------

export type RecipeState = "public" | "stopped" | "taken_down";

export function recipeState(r: Pick<Recipe, "publishedAt" | "takenDownAt">): RecipeState {
  if (r.takenDownAt) return "taken_down";
  return r.publishedAt ? "public" : "stopped";
}

export const listedRecipe = () => and(isNotNull(recipe.publishedAt), isNull(recipe.takenDownAt));

type Row = { recipe: Recipe; handle: string };
const columns = { recipe, handle: creatorProfile.handle };

// The recipe behind a public link, whatever its state now (so the page can say it's gone).
export async function publicRecipe(db: Db, publicId: string): Promise<Row | null> {
  if (!PUBLIC_ID.test(publicId)) return null;
  const [row] = await db.select(columns).from(recipe).innerJoin(creatorProfile, eq(creatorProfile.userId, recipe.makerId)).where(eq(recipe.publicId, publicId));
  return row ?? null;
}

export const styleLabel = (id: string) => FILM_STYLES.find((s) => s.id === id)?.label ?? id;
const spec = (r: Recipe) => recipeSpecSchema.parse(r.spec);

// Standard story reels, and motion and dance reels without an AI song, use the free weekly reels.
export function isFree(r: Pick<Recipe, "quality" | "spec">): boolean {
  const s = r.spec as RecipeSpec;
  return r.quality === "standard" && !(s.format === "dance" && s.voice === "ai_song");
}

// A tile: what rails and grids need.
export function recipeCard(r: Row) {
  const x = r.recipe;
  const story = x.format === "story" ? (x.spec as Extract<RecipeSpec, { format: "story" }>) : null;
  return {
    publicId: x.publicId,
    name: x.name,
    handle: r.handle,
    format: x.format,
    style: story ? story.style : null,
    styleLabel: story ? styleLabel(story.style) : null,
    durationSec: x.durationSec,
    quality: x.quality,
    kidSafe: x.kidSafe,
    free: isFree(x),
    occasions: x.occasions,
    useCount: x.useCount,
    posterUrl: x.posterPath ? `/api/recipes/public/${x.publicId}/poster` : null,
    languageHint: x.languageHint,
  };
}
export type RecipeCard = ReturnType<typeof recipeCard>;

// What "The recipe has" lists, in the viewer's language where the AI wrote it.
export function recipeHas(s: RecipeSpec, lang = "en") {
  switch (s.format) {
    case "story":
      return {
        format: s.format,
        style: s.style,
        styleLabel: styleLabel(s.style),
        durationSec: s.durationSec,
        quality: s.quality,
        shape: { ...shapeSummary(s.shape), tone: s.shape.tone, shots: s.shape.shots.map((x, i) => ({ role: x.role, intent: s.intentI18n[lang]?.[i] ?? x.intent })) },
        music: true,
      };
    case "motion":
      return { format: s.format, durationSec: s.durationSec, theme: s.theme, slides: s.slides, ending: s.ending, music: true };
    case "dance":
      return { format: s.format, durationSec: s.durationSec, scene: s.scene, bpm: s.bpm, dancers: s.dancers.length, lines: s.moves.length, voice: s.voice };
    case "edit":
      return { format: s.format, durationSec: s.durationSec, captions: s.captions, zooms: s.zooms, effects: s.effects, sounds: s.sounds, voice: s.voice, mix: Object.keys(s.mix.effects).concat(Object.keys(s.mix.cards)) };
  }
}

// The recipe page (app and web). A stopped or removed recipe says only that.
export function publicRecipeView(r: Row, viewerId?: string, lang = "en") {
  const x = r.recipe;
  const state = recipeState(x);
  const base = { state, publicId: x.publicId, mine: viewerId === x.makerId };
  if (state !== "public") return { ...base, recipe: null };
  return {
    ...base,
    recipe: {
      ...recipeCard(r),
      topicHint: x.topicHint,
      previewUrl: x.previewKind === "reel" && x.previewPath ? `/api/recipes/public/${x.publicId}/preview` : null,
      has: recipeHas(spec(x), lang),
      rateBp: EARN_RATE_BP,
    },
  };
}
export type PublicRecipeView = ReturnType<typeof publicRecipeView>;

// What the maker earns from one use: "n" whole credits or more, "small" under one, "free" for a
// free reel or a payer with only free credits, "own" for your own recipe. Rounded down.
export function makerEarns(credits: number, paidRatioBp: number, own: boolean, rateBp = EARN_RATE_BP): { hundredths: number; kind: "n" | "small" | "free" | "own" } {
  if (own) return { hundredths: 0, kind: "own" };
  const hundredths = earningHundredths(credits, paidRatioBp, rateBp);
  return { hundredths, kind: hundredths >= 100 ? "n" : hundredths > 0 ? "small" : "free" };
}

// ---------- Lists ----------

export type RecipeList = "trending" | "new" | "free" | "kids";
export const RECIPE_FORMATS = ["story", "motion", "dance", "edit"] as const;

const DAY_MS = 86400_000;

// Finished uses by others in the last 7 days, for "Trending this week".
const weekUses = (now: Date) =>
  sql<number>`(select count(*)::int from ${recipeUse} where ${recipeUse.recipeId} = ${recipe.id} and ${recipeUse.status} = 'completed' and ${recipeUse.ownUse} = false and ${recipeUse.completedAt} >= ${new Date(now.getTime() - 7 * DAY_MS).toISOString()}::timestamp)`;

// Recipes this viewer reported stay hidden for them.
const notReportedBy = (viewerId?: string) =>
  viewerId ? notExists(sql`(select 1 from ${recipeReport} where ${recipeReport.recipeId} = ${recipe.id} and ${recipeReport.reporterId} = ${viewerId})`) : undefined;

export interface ListOptions {
  list?: RecipeList;
  format?: RecipeFormat;
  collection?: string;
  makerHandle?: string;
  viewerId?: string;
  // Leave out the viewer's own (the Create rail).
  skipOwn?: boolean;
  exclude?: string;
  limit?: number;
  offset?: number;
  now?: Date;
}

export async function listRecipes(db: Db, o: ListOptions = {}) {
  const now = o.now ?? new Date();
  const where: (SQL | undefined)[] = [listedRecipe(), notReportedBy(o.viewerId)];
  if (o.format) where.push(eq(recipe.format, o.format));
  if (o.collection) where.push(sql`${recipe.occasions} @> array[${o.collection}]::text[]`);
  if (o.makerHandle) where.push(eq(creatorProfile.handle, o.makerHandle));
  if (o.skipOwn && o.viewerId) where.push(ne(recipe.makerId, o.viewerId));
  if (o.exclude) where.push(ne(recipe.publicId, o.exclude));
  if (o.list === "free") where.push(and(eq(recipe.quality, "standard"), sql`coalesce(${recipe.spec}->>'voice', '') <> 'ai_song'`));
  if (o.list === "kids") where.push(eq(recipe.kidSafe, true));
  const order = o.list === "new" ? [desc(recipe.publishedAt)] : [desc(weekUses(now)), desc(recipe.useCount), desc(recipe.publishedAt)];
  const rows = await db
    .select(columns)
    .from(recipe)
    .innerJoin(creatorProfile, eq(creatorProfile.userId, recipe.makerId))
    .where(and(...where))
    .orderBy(...order)
    .limit(o.limit ?? 20)
    .offset(o.offset ?? 0);
  return rows.map(recipeCard);
}

// At most 2 per maker in the first 12 of a collection, so one maker can't fill it.
export function spreadMakers<T extends { handle: string }>(cards: T[], first = 12, perMaker = 2): T[] {
  const head: T[] = [];
  const rest: T[] = [];
  const seen = new Map<string, number>();
  for (const c of cards) {
    const n = seen.get(c.handle) ?? 0;
    if (head.length < first && n < perMaker) {
      head.push(c);
      seen.set(c.handle, n + 1);
    } else rest.push(c);
  }
  return [...head, ...rest];
}

export function festivalView(f: Festival, lang: "en" | "hi" | "ar", now = new Date()) {
  const d = nextDates(f, now);
  return { slug: f.slug, name: f.name[lang], nameEn: f.name.en, native: f.name, date: d?.first ?? null, inDays: daysUntil(f, now), allYear: !f.dates.length };
}

const pageLang = (lang?: string | null): "en" | "hi" | "ar" => (lang === "hi" || lang === "ar" ? lang : "en");

// Create and the gallery: the festival card (while a festival is near), rails and collections.
export async function recipesHome(db: Db, opts: { viewerId?: string; lang?: string | null; tz?: string | null; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const lang = pageLang(opts.lang);
  const region = regionFor(opts.lang, opts.tz);
  const near = nearFestivals(now, region)[0];
  const base = { viewerId: opts.viewerId, now };
  const [start, trending, fresh, free, kids, festivalRecipes] = await Promise.all([
    listRecipes(db, { ...base, skipOwn: true, limit: 6 }),
    listRecipes(db, { ...base, list: "trending", limit: 10 }),
    listRecipes(db, { ...base, list: "new", limit: 10 }),
    listRecipes(db, { ...base, list: "free", limit: 10 }),
    listRecipes(db, { ...base, list: "kids", limit: 10 }),
    near ? listRecipes(db, { ...base, collection: near.slug, limit: 3 }) : Promise.resolve([]),
  ]);
  const counts = await db
    .select({ slug: sql<string>`unnest(${recipe.occasions})`, n: sql<number>`count(*)::int` })
    .from(recipe)
    .where(listedRecipe())
    .groupBy(sql`1`);
  const count = new Map(counts.map((c) => [c.slug, Number(c.n)]));
  return {
    festival: near ? { ...festivalView(near, lang, now), thumbs: festivalRecipes } : null,
    start,
    rails: { trending, new: fresh, free, kids },
    collections: festivalCalendar(now, region).map((f) => ({ ...festivalView(f, lang, now), count: count.get(f.slug) ?? 0 })),
  };
}

// One collection (C3): the owner's featured picks first, then by uses this week, max 2 per maker in the first 12.
export async function recipeCollection(db: Db, slug: string, opts: { viewerId?: string; lang?: string | null; format?: RecipeFormat; now?: Date } = {}) {
  const f = findFestival(slug);
  if (!f) return null;
  const all = await listRecipes(db, { viewerId: opts.viewerId, collection: slug, format: opts.format, limit: 100, now: opts.now });
  const featured = f.featured.map((id) => all.find((c) => c.publicId === id)).filter((c): c is RecipeCard => Boolean(c));
  const rest = spreadMakers(all.filter((c) => !f.featured.includes(c.publicId)));
  return { festival: { ...festivalView(f, pageLang(opts.lang), opts.now), count: all.length }, featured, recipes: rest };
}

// The share sheet's "Good for" chips.
export function goodFor(lang?: string | null, now = new Date()) {
  return upcomingFestivals(now).map((f) => festivalView(f, pageLang(lang), now));
}

// ---------- Using a recipe ----------

export class RecipeGoneError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// The recipe for "Use this recipe": 404 unknown, 410 stopped or taken down.
export async function recipeForUse(db: Db, publicId: unknown): Promise<Recipe> {
  const found = typeof publicId === "string" ? await publicRecipe(db, publicId) : null;
  if (!found) throw new RecipeGoneError("We couldn't find this recipe.", 404);
  if (recipeState(found.recipe) !== "public") throw new RecipeGoneError("This recipe isn't shared any more. You can still make this reel without it.", 410);
  return found.recipe;
}

export const recipeSpecOf = spec;

// The reel was charged: record the use and, when someone else's recipe cost them credits, the
// maker's pending earning. Free reels (0 credits) and your own uses earn nothing.
export async function recipeStarted(db: Db, r: Recipe, use: { filmId: string; userId: string; credits: number }) {
  const own = r.makerId === use.userId;
  const earning = !own && use.credits > 0 ? await startEarning(db, { source: "recipe", sourceRef: use.filmId, subjectRef: r.id, earnerId: r.makerId, payerId: use.userId, charged: use.credits }) : null;
  await db.update(film).set({ recipeId: r.id }).where(eq(film.id, use.filmId));
  const [row] = await db.insert(recipeUse).values({ recipeId: r.id, userId: use.userId, filmId: use.filmId, credits: use.credits, ownUse: own, earningId: earning?.id ?? null }).returning();
  return row;
}

// ---------- The worker ----------

// A recipe reel finished: the use counts (unless it's the maker's own) and the earning settles,
// unless the recipe was taken down meanwhile. A stopped recipe still earns. Returns the settled
// earning, if there was one.
export async function recipeReelFinished(db: Db, filmId: string, now = new Date()) {
  const [use] = await db
    .update(recipeUse)
    .set({ status: "completed", completedAt: now })
    .where(and(eq(recipeUse.filmId, filmId), eq(recipeUse.status, "started")))
    .returning();
  if (!use) return null;
  if (!use.ownUse) await db.update(recipe).set({ useCount: sql`${recipe.useCount} + 1` }).where(eq(recipe.id, use.recipeId));
  const [r] = await db.select({ takenDownAt: recipe.takenDownAt }).from(recipe).where(eq(recipe.id, use.recipeId));
  if (r?.takenDownAt) {
    await dropEarning(db, "recipe", filmId, now);
    return null;
  }
  return settleEarning(db, "recipe", filmId, now);
}

// It failed and was refunded: the maker earns nothing.
export async function recipeReelFailed(db: Db, filmId: string, now = new Date()): Promise<void> {
  await db.update(recipeUse).set({ status: "failed" }).where(and(eq(recipeUse.filmId, filmId), eq(recipeUse.status, "started")));
  await dropEarning(db, "recipe", filmId, now);
}

// ---------- The maker's reel and Earnings ----------

// The recipe a reel was made with, as "Recipe by @maker".
export async function madeWithRecipe(db: Db, recipeId: string | null) {
  if (!recipeId) return null;
  const [r] = await db.select(columns).from(recipe).innerJoin(creatorProfile, eq(creatorProfile.userId, recipe.makerId)).where(eq(recipe.id, recipeId));
  return r ? { publicId: r.recipe.publicId, name: r.recipe.name, handle: r.handle, state: recipeState(r.recipe) } : null;
}

// The finished reel's recipe card (M1): the recipe made from it, or the one it was made with.
export async function filmRecipeInfo(db: Db, f: Film, baseUrl: string) {
  const madeFrom = await madeWithRecipe(db, f.recipeId);
  const [mine] = await db.select().from(recipe).where(eq(recipe.sourceFilmId, f.id));
  const block = recipeBlock(f);
  return {
    eligible: !block,
    reason: block,
    madeFrom,
    recipe: mine ? { ...(await recipeStats(db, mine)), publicId: mine.publicId, name: mine.name, state: recipeState(mine), url: recipeUrl(baseUrl, mine.publicId) } : null,
  };
}

// The maker's numbers: reels made by others, credits earned and uses this week.
export async function recipeStats(db: Db, r: Recipe, now = new Date()) {
  const [earned] = await db
    .select({ h: sql<number>`coalesce(sum(${creatorEarning.hundredths}), 0)::int` })
    .from(creatorEarning)
    .where(and(eq(creatorEarning.userId, r.makerId), eq(creatorEarning.source, "recipe"), eq(creatorEarning.subjectRef, r.id), eq(creatorEarning.status, "earned")));
  const [week] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(recipeUse)
    .where(and(eq(recipeUse.recipeId, r.id), eq(recipeUse.status, "completed"), eq(recipeUse.ownUse, false), gte(recipeUse.completedAt, new Date(now.getTime() - 7 * DAY_MS))));
  return { useCount: r.useCount, earnedHundredths: Number(earned?.h ?? 0), thisWeek: Number(week?.n ?? 0) };
}

// Names and posters of the maker's recipes for the Earnings list (DescribeSubjects for "recipe").
export async function recipeSubjects(db: Db, refs: string[]): Promise<Map<string, SubjectInfo>> {
  const ids = refs.filter((r) => z.uuid().safeParse(r).success);
  if (!ids.length) return new Map();
  const rows = await db.select().from(recipe).where(inArray(recipe.id, ids));
  return new Map(rows.map((r) => [r.id, { title: r.name, coverUrl: r.posterPath ? `/api/recipes/public/${r.publicId}/poster` : null, publicId: recipeState(r) === "public" ? r.publicId : null }]));
}

// Finished uses by others that cost nothing (free weekly reels), per recipe: "38 uses · 12 free".
export async function recipeFreeUses(db: Db, ids: string[]): Promise<Map<string, number>> {
  const valid = ids.filter((r) => z.uuid().safeParse(r).success);
  if (!valid.length) return new Map();
  const rows = await db
    .select({ id: recipeUse.recipeId, n: sql<number>`count(*)::int` })
    .from(recipeUse)
    .where(and(inArray(recipeUse.recipeId, valid), eq(recipeUse.status, "completed"), eq(recipeUse.ownUse, false), eq(recipeUse.credits, 0)))
    .groupBy(recipeUse.recipeId);
  return new Map(rows.map((r) => [r.id, Number(r.n)]));
}

// States for the Earnings row of a recipe (stopped or removed).
export async function recipeStates(db: Db, ids: string[]): Promise<Map<string, RecipeState>> {
  const valid = ids.filter((r) => z.uuid().safeParse(r).success);
  if (!valid.length) return new Map();
  const rows = await db.select({ id: recipe.id, publishedAt: recipe.publishedAt, takenDownAt: recipe.takenDownAt }).from(recipe).where(inArray(recipe.id, valid));
  return new Map(rows.map((r) => [r.id, recipeState(r)]));
}

// ---------- Report ----------

export const recipeReportSchema = z.object({
  reason: z.enum(giftReportReason.enumValues),
  details: z.string().trim().max(500).default(""),
  email: z.string().trim().email().max(200).optional().or(z.literal("").transform(() => undefined)),
});

// A report never hides a recipe by itself; a person reviews it and sets taken_down_at.
export async function saveRecipeReport(db: Db, recipeId: string, r: z.infer<typeof recipeReportSchema>, reporterId?: string): Promise<void> {
  await db.insert(recipeReport).values({ recipeId, reason: r.reason, details: r.details, email: r.email ?? null, reporterId: reporterId ?? null });
}
