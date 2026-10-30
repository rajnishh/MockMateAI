import type { Db } from "@/lib/db";
import { type Film, getFilm, listFilms } from "@/lib/films";
import type { Brand } from "@/lib/motion/render";
import { type Post, createPost } from "@/lib/posts";
import { readFilmScript, writePostCopy } from "@/lib/post-copy";
import type { LlmProvider } from "@/lib/providers/types";
import { listAccounts } from "@/lib/social-accounts";
import { suggestIdeas } from "@/lib/suggestions";
import { type ActionInput, ACTIONS, type ActionName, isAction } from "./actions";
import type { AgentCard, PostingMode } from "./cards";
import { buildPlannerPrompt, planSchema } from "./planner";
import { createAction, getAction, getPostingMode, moveAction, recentMessages, saveMessage, setPostingMode, waitingFor } from "./store";
import { addDays, formatWhen, localNow, nextSlot, zonedToUtc } from "./time";

type Account = Awaited<ReturnType<typeof listAccounts>>[number];

// What the agent can use. Routes pass the real services; tests pass fakes.
export interface AgentDeps {
  db: Db;
  llm: LlmProvider;
  startFilm(userId: string, body: unknown): Promise<{ id: string; credits: number }>;
  rerenderEdit(userId: string, filmId: string, changes: { voice?: "natural" | "clear" | "deeper"; sounds?: boolean; captions?: boolean }): Promise<{ rendersLeft: number }>;
  enqueuePost(post: Post): Promise<void>;
  freeReelsLeft(userId: string): Promise<number>;
  now?: () => Date;
}

// Who is asking and their app preferences (the apps keep language, topic and brand on the device).
export interface Turn {
  userId: string;
  timeZone: string;
  language?: string;
  topic?: string;
  brand?: Brand;
}

interface TurnState {
  mode: PostingMode;
  reels: Film[];
  // Reels started during this reply, so "make it and post it" can refer to them.
  made: string[];
  accounts: Account[];
  now: Date;
}

// A post the creator approved (or that needs no approval): who, where, when. Resolved up front so
// approving later does exactly what was shown.
interface PostPlan {
  filmId: string;
  accountIds: string[];
  // ISO time, or null for "as soon as it's ready".
  at: string | null;
  // The creator's zone, for the messages written when a waiting post goes out.
  timeZone: string;
}

const PLATFORM: Record<string, string> = { instagram: "Instagram", youtube: "YouTube" };

// Messages people can act on; anything else is logged and reported plainly.
function problem(err: unknown, what: string): AgentCard {
  const e = err as Error & { needCredits?: boolean; status?: number };
  if (e.needCredits) return { type: "credits", text: e.message };
  if (typeof e.status === "number" && e.status < 500) return { type: "error", text: e.message };
  console.error(`[agent] ${what} failed:`, e);
  return { type: "error", text: `Something went wrong while trying to ${what}. Please try again.` };
}

async function loadState(deps: AgentDeps, userId: string): Promise<TurnState> {
  const [mode, reels, accounts] = await Promise.all([getPostingMode(deps.db, userId), listFilms(deps.db, userId, 8), listAccounts(deps.db, userId)]);
  // Expired Instagram tokens can't post; those accounts must be connected again.
  const usable = accounts.filter((a) => !(a.platform === "instagram" && a.expiresAt < new Date()));
  return { mode, reels, accounts: usable, made: [], now: deps.now?.() ?? new Date() };
}

async function resolveReel(deps: AgentDeps, turn: Turn, state: TurnState, ref: string): Promise<Film | undefined> {
  const r = ref.trim();
  let id: string | undefined;
  if (/^latest$/i.test(r)) id = state.made.at(-1) ?? state.reels[0]?.id;
  else if (/^N\d+$/i.test(r)) id = state.made[Number(r.slice(1)) - 1];
  else if (/^R\d+$/i.test(r)) id = state.reels[Number(r.slice(1)) - 1]?.id;
  else id = r;
  return id ? getFilm(deps.db, turn.userId, id).catch(() => undefined) : undefined;
}

const reelTitle = (f: Pick<Film, "title" | "story">) => f.title ?? (f.story.length > 48 ? `${f.story.slice(0, 45)}…` : f.story);

function describePost(f: Film, accounts: Account[], at: string | null, tz: string): string {
  const where = accounts.map((a) => PLATFORM[a.platform] ?? a.platform).join(" and ");
  return `Post “${reelTitle(f)}” to ${where} ${at ? formatWhen(new Date(at), tz) : "as soon as it's ready"}`;
}

// Creates the posts for a finished reel, each with its own AI caption.
async function publish(deps: AgentDeps, userId: string, plan: PostPlan, tz: string): Promise<AgentCard[]> {
  const f = await getFilm(deps.db, userId, plan.filmId);
  if (!f) return [{ type: "error", text: "That reel no longer exists." }];
  const accounts = (await listAccounts(deps.db, userId)).filter((a) => plan.accountIds.includes(a.id));
  if (!accounts.length) return [{ type: "connect", text: "Connect Instagram or YouTube to post." }];
  const script = await readFilmScript(f.outputPath).catch(() => undefined);
  // A time that passed while the reel was being made means "now".
  const at = plan.at && new Date(plan.at).getTime() > (deps.now?.() ?? new Date()).getTime() ? plan.at : undefined;
  const cards: AgentCard[] = [];
  for (const account of accounts) {
    const copy = await writePostCopy(deps.llm, account.platform, {
      story: f.story,
      title: f.title,
      narration: script?.shots.map((s) => s.narration),
      language: script?.language,
      kidSafe: f.kidSafe,
    }).catch(() => ({ title: reelTitle(f), caption: reelTitle(f), hashtags: [] as string[] }));
    try {
      const post = await createPost(deps.db, userId, {
        filmId: f.id,
        socialAccountId: account.id,
        title: (copy.title || reelTitle(f)).slice(0, 100),
        description: [copy.caption, copy.hashtags.join(" ")].filter(Boolean).join("\n\n"),
        tags: copy.hashtags.map((h) => h.replace(/^#/, "")).slice(0, 15),
        privacy: "public",
        scheduledAt: at,
      });
      await deps.enqueuePost(post);
      cards.push({
        type: "post",
        reelId: f.id,
        status: "scheduled",
        at: post.scheduledAt.toISOString(),
        text: `${at ? "Scheduled" : "Posting"} “${reelTitle(f)}” on ${PLATFORM[account.platform]} ${at ? formatWhen(post.scheduledAt, tz) : "now"}`,
      });
    } catch (err) {
      cards.push(problem(err, `post to ${PLATFORM[account.platform]}`));
    }
  }
  return cards;
}

// Posts now if the reel is ready, otherwise waits for it (the worker finishes the job).
async function postOrWait(deps: AgentDeps, userId: string, plan: PostPlan, tz: string, actionId?: string): Promise<AgentCard[]> {
  const f = await getFilm(deps.db, userId, plan.filmId);
  if (!f || f.status === "failed") {
    if (actionId) await moveAction(deps.db, actionId, "waiting", { status: "failed", error: "The reel couldn't be made" });
    return [{ type: "error", text: "That reel couldn't be made, so it wasn't posted." }];
  }
  if (f.status !== "completed") {
    if (!actionId) await createAction(deps.db, { userId, name: "post_reel", input: plan, status: "waiting", filmId: f.id });
    return [{ type: "post", reelId: f.id, status: "waiting", at: plan.at, text: `Will post “${reelTitle(f)}” when it's ready${plan.at ? ` (${formatWhen(new Date(plan.at), tz)})` : ""}` }];
  }
  const cards = await publish(deps, userId, plan, tz);
  if (actionId) await moveAction(deps.db, actionId, "waiting", { status: cards.some((c) => c.type === "post") ? "done" : "failed" });
  else await createAction(deps.db, { userId, name: "post_reel", input: plan, status: cards.some((c) => c.type === "post") ? "done" : "failed", filmId: f.id });
  return cards;
}

async function postReel(deps: AgentDeps, turn: Turn, state: TurnState, input: ActionInput<"post_reel">): Promise<AgentCard[]> {
  const f = await resolveReel(deps, turn, state, input.reel);
  if (!f) return [{ type: "error", text: "I couldn't find that reel. Ask me to list your reels." }];
  const accounts = state.accounts.filter((a) => !input.platforms?.length || input.platforms.includes(a.platform as "instagram" | "youtube"));
  if (!accounts.length) return [{ type: "connect", text: input.platforms?.length ? `Connect ${input.platforms.map((p) => PLATFORM[p]).join(" and ")} first.` : "Connect Instagram or YouTube first." }];

  const tz = turn.timeZone;
  let at: Date | null;
  if (input.now) at = null;
  else if (input.date || input.time) at = zonedToUtc(input.date ?? localNow(state.now, tz).date, input.time ?? "19:30", tz);
  else at = state.mode === "auto_now" ? null : nextSlot(state.now, tz);
  if (at && at.getTime() < state.now.getTime() - 60_000) return [{ type: "error", text: `${formatWhen(at, tz)} has already passed. Pick a later time.` }];

  const plan: PostPlan = { filmId: f.id, accountIds: accounts.map((a) => a.id), at: at?.toISOString() ?? null, timeZone: tz };
  if (state.mode === "ask") {
    const action = await createAction(deps.db, { userId: turn.userId, name: "post_reel", input: plan, status: "proposed", filmId: f.id });
    return [{ type: "proposal", actionId: action.id, status: "proposed", text: describePost(f, accounts, plan.at, tz) }];
  }
  return postOrWait(deps, turn.userId, plan, tz);
}

async function makeReel(deps: AgentDeps, turn: Turn, state: TurnState, input: ActionInput<"make_reel">): Promise<AgentCard[]> {
  try {
    const { id } = await deps.startFilm(turn.userId, {
      story: input.idea,
      format: input.format,
      language: input.language ?? turn.language ?? "auto",
      durationSec: input.durationSec,
      quality: "standard",
      ...(input.style ? { style: input.style } : {}),
      ...(input.format === "motion" ? { ending: input.ending ?? "auto", brand: turn.brand } : {}),
    });
    state.made.push(id);
    return [{ type: "reel", reelId: id, title: input.title ?? (input.idea.length > 48 ? `${input.idea.slice(0, 45)}…` : input.idea), status: "queued" }];
  } catch (err) {
    return [problem(err, "make the reel")];
  }
}

async function run(deps: AgentDeps, turn: Turn, state: TurnState, name: ActionName, raw: unknown): Promise<AgentCard[]> {
  const parsed = ACTIONS[name].input.safeParse(raw ?? {});
  if (!parsed.success) return [{ type: "error", text: `I couldn't do that: ${parsed.error.issues[0]?.message ?? "some details were missing"}.` }];
  switch (name) {
    case "suggest_ideas": {
      const i = parsed.data as ActionInput<"suggest_ideas">;
      try {
        const ideas = await suggestIdeas(deps.llm, { niche: i.topic ?? turn.topic, language: i.language ?? turn.language });
        return [{ type: "ideas", ideas: ideas.slice(0, i.count), format: i.format, language: i.language ?? turn.language }];
      } catch (err) {
        return [problem(err, "find ideas")];
      }
    }
    case "make_reel":
      return makeReel(deps, turn, state, parsed.data as ActionInput<"make_reel">);
    case "make_week": {
      const i = parsed.data as ActionInput<"make_week">;
      let ideas;
      try {
        ideas = (await suggestIdeas(deps.llm, { niche: i.topic ?? turn.topic, language: i.language ?? turn.language })).slice(0, i.count);
      } catch (err) {
        return [problem(err, "plan the week")];
      }
      const first = i.startDate ?? localNow(nextSlot(state.now, turn.timeZone, i.time), turn.timeZone).date;
      const cards: AgentCard[] = [];
      for (const [day, idea] of ideas.entries()) {
        const made = await makeReel(deps, turn, state, { idea: `${idea.title}. ${idea.idea}`, title: idea.title, format: i.format, language: i.language, durationSec: i.durationSec });
        cards.push(...made);
        // Out of free reels or credits: stop instead of failing the rest one by one.
        if (made[0]?.type !== "reel") break;
        if (i.post) cards.push(...(await postReel(deps, turn, state, { reel: "latest", date: addDays(first, day), time: i.time ?? "19:30" })));
      }
      return cards;
    }
    case "post_reel":
      return postReel(deps, turn, state, parsed.data as ActionInput<"post_reel">);
    case "write_caption": {
      const i = parsed.data as ActionInput<"write_caption">;
      const f = await resolveReel(deps, turn, state, i.reel);
      if (!f) return [{ type: "error", text: "I couldn't find that reel." }];
      if (f.status !== "completed") return [{ type: "error", text: `“${reelTitle(f)}” isn't ready yet. Ask again when it's done.` }];
      const script = await readFilmScript(f.outputPath).catch(() => undefined);
      try {
        const copy = await writePostCopy(deps.llm, i.platform, { story: f.story, title: f.title, narration: script?.shots.map((s) => s.narration), language: script?.language, kidSafe: f.kidSafe });
        return [{ type: "caption", reelId: f.id, platform: i.platform, text: [i.platform === "youtube" ? copy.title : "", copy.caption, copy.hashtags.join(" ")].filter(Boolean).join("\n\n") }];
      } catch (err) {
        return [problem(err, "write the caption")];
      }
    }
    case "list_reels":
      return [{ type: "reels", reels: state.reels.map((f) => ({ reelId: f.id, title: reelTitle(f), status: f.status, format: f.format })) }];
    case "change_edit": {
      const i = parsed.data as ActionInput<"change_edit">;
      const f = await resolveReel(deps, turn, state, i.reel);
      if (!f || f.format !== "edit") return [{ type: "error", text: "That works on videos you uploaded with “Edit my video”." }];
      try {
        const { rendersLeft } = await deps.rerenderEdit(turn.userId, f.id, { voice: i.voice, sounds: i.sounds, captions: i.captions });
        return [{ type: "reel", reelId: f.id, title: reelTitle(f), status: "queued", note: `Rendering again · ${rendersLeft} free re-renders left` }];
      } catch (err) {
        return [problem(err, "change the video")];
      }
    }
    case "set_posting_mode": {
      const i = parsed.data as ActionInput<"set_posting_mode">;
      await setPostingMode(deps.db, turn.userId, i.mode);
      state.mode = i.mode;
      return [{ type: "settings", postingMode: i.mode }];
    }
  }
}

// One chat message: plan with the AI, then do it. Results come back as cards with the reply.
export async function handleMessage(deps: AgentDeps, turn: Turn, text: string) {
  const state = await loadState(deps, turn.userId);
  const history = await recentMessages(deps.db, turn.userId, 12);
  const prompt = buildPlannerPrompt({ turn, state, history, freeLeft: await deps.freeReelsLeft(turn.userId).catch(() => null), text });
  let plan: { reply: string; actions: { name: string; input?: unknown }[] };
  try {
    plan = planSchema.parse(await deps.llm.completeJson(prompt));
  } catch (err) {
    console.error("[agent] plan failed:", err);
    plan = { reply: "Sorry, I didn't get that. Try “make 3 reels on chai hacks and post them this week”.", actions: [] };
  }
  const user = await saveMessage(deps.db, turn.userId, "user", text);
  const cards: AgentCard[] = [];
  for (const a of plan.actions.slice(0, 5)) {
    if (!isAction(a.name)) continue;
    cards.push(...(await run(deps, turn, state, a.name, a.input)));
  }
  const assistant = await saveMessage(deps.db, turn.userId, "assistant", plan.reply, cards);
  return { user, assistant };
}

// One action without the AI: buttons on cards ("Make this") and, later, connector tools.
export async function runAction(deps: AgentDeps, turn: Turn, name: string, input: unknown, label?: string) {
  if (!isAction(name)) throw new Error(`Unknown action ${name}`);
  const state = await loadState(deps, turn.userId);
  if (label) await saveMessage(deps.db, turn.userId, "user", label);
  const cards = await run(deps, turn, state, name, input);
  return saveMessage(deps.db, turn.userId, "assistant", "", cards);
}

// The creator's answer to a proposal card.
export async function decide(deps: AgentDeps, turn: Turn, actionId: string, approve: boolean) {
  const action = await getAction(deps.db, turn.userId, actionId);
  if (!action || action.status !== "proposed") return saveMessage(deps.db, turn.userId, "assistant", "That was already handled.", []);
  if (!approve) {
    await moveAction(deps.db, action.id, "proposed", { status: "cancelled" });
    return saveMessage(deps.db, turn.userId, "assistant", "Okay, I won't post it.", []);
  }
  // Claim it first: a double tap must not post twice.
  if (!(await moveAction(deps.db, action.id, "proposed", { status: "waiting" }))) return saveMessage(deps.db, turn.userId, "assistant", "That was already handled.", []);
  const cards = await postOrWait(deps, turn.userId, action.input as PostPlan, turn.timeZone, action.id);
  return saveMessage(deps.db, turn.userId, "assistant", "", cards);
}

// Called by the worker when a reel finishes (or fails): posts that were waiting for it go out.
export async function onReelFinished(deps: AgentDeps, filmId: string) {
  for (const action of await waitingFor(deps.db, filmId)) {
    const plan = action.input as PostPlan;
    const cards = await postOrWait(deps, action.userId, plan, plan.timeZone ?? "Asia/Kolkata", action.id);
    await saveMessage(deps.db, action.userId, "assistant", "", cards);
  }
}
