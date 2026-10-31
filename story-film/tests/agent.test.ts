import { beforeEach, describe, expect, it } from "vitest";
import { ACTIONS, describeActions } from "@/lib/agent/actions";
import { decide, handleMessage, onReelFinished, runAction, type AgentDeps } from "@/lib/agent/agent";
import type { AgentCard } from "@/lib/agent/cards";
import { buildPlannerPrompt } from "@/lib/agent/planner";
import { getPostingMode, historyView } from "@/lib/agent/store";
import { addDays, localNow, nextSlot, zonedToUtc } from "@/lib/agent/time";
import type { Db } from "@/lib/db";
import { scheduledPost, socialAccount, user } from "@/lib/db/schema";
import { createFilm, updateFilm } from "@/lib/films";
import type { Post } from "@/lib/posts";
import type { LlmProvider } from "@/lib/providers/types";
import { testDb } from "./helpers/db";

const TZ = "Asia/Kolkata";
// Thursday 29 Oct 2026, 3:30 pm in India.
const NOW = new Date("2026-10-29T10:00:00Z");

describe("dates in the creator's time zone", () => {
  it("turns local times into instants and finds the next evening slot", () => {
    expect(zonedToUtc("2026-10-31", "19:30", TZ).toISOString()).toBe("2026-10-31T14:00:00.000Z");
    expect(zonedToUtc("2026-10-31", "19:30", "Asia/Dubai").toISOString()).toBe("2026-10-31T15:30:00.000Z");
    expect(localNow(NOW, TZ)).toEqual({ date: "2026-10-29", time: "15:30", weekday: "Thursday" });
    expect(nextSlot(NOW, TZ).toISOString()).toBe("2026-10-29T14:00:00.000Z");
    // After 7:20 pm the slot moves to tomorrow.
    expect(nextSlot(new Date("2026-10-29T13:55:00Z"), TZ).toISOString()).toBe("2026-10-30T14:00:00.000Z");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("planner prompt", () => {
  it("lists every action and the creator's situation", () => {
    for (const name of Object.keys(ACTIONS)) expect(describeActions()).toContain(`- ${name} {`);
    const prompt = buildPlannerPrompt({
      turn: { timeZone: TZ, language: "hi", topic: "cooking" },
      state: { mode: "ask", reels: [], accounts: [], now: NOW },
      history: [],
      freeLeft: 2,
      text: "kal shaam ek reel post karo",
    });
    expect(prompt).toContain("Now: Thursday 2026-10-29 15:30 (Asia/Kolkata)");
    expect(prompt).toContain("Hindi");
    expect(prompt).toContain("Free reels left this week: 2");
    expect(prompt).toContain("none connected");
    expect(prompt).toContain("Creator: kal shaam ek reel post karo");
  });
});

describe("Ask Reelkar", { timeout: 30_000 }, () => {
  let db: Db;
  let plans: unknown[];
  let started: unknown[];
  let enqueued: Post[];
  let deps: AgentDeps;
  const turn = { userId: "u1", timeZone: TZ, language: "hi", topic: "chai" };

  const llm = {
    modelId: "llama-3.3-70b",
    completeJson: async (prompt: string) => {
      if (prompt.startsWith("You are Ask Reelkar")) return plans.shift() ?? { reply: "?", actions: [] };
      if (prompt.includes("Suggest 6 ideas")) {
        return { ideas: [1, 2, 3, 4].map((n) => ({ title: `Chai hack ${n}`, idea: `A quick chai trick number ${n} that saves time every morning.` })) };
      }
      return { title: "Chai hack", caption: "Try this tonight!", hashtags: ["#chai", "#hack"] };
    },
  } as unknown as LlmProvider;

  const cardsOf = (m: { cards: unknown }) => m.cards as AgentCard[];

  beforeEach(async () => {
    db = await testDb();
    const now = new Date();
    await db.insert(user).values({ id: "u1", name: "One", email: "one@example.com", createdAt: now, updatedAt: now });
    await db.insert(socialAccount).values({ userId: "u1", platform: "instagram", externalId: "ig1", name: "@chaiwala", accessToken: "x", expiresAt: new Date(Date.now() + 86400_000) });
    plans = [];
    started = [];
    enqueued = [];
    deps = {
      db,
      llm,
      now: () => NOW,
      freeReelsLeft: async () => 3,
      startFilm: async (userId, body) => {
        started.push(body);
        if (started.length > 3) throw Object.assign(new Error("You've used this week's 3 free videos. Buy credits to keep creating."), { needCredits: true, status: 402 });
        const f = await createFilm(db, { userId, story: (body as { story: string }).story, style: "animated", durationSec: 30, format: (body as { format: "story" | "motion" }).format });
        return { id: f.id, credits: 0 };
      },
      rerenderEdit: async () => ({ rendersLeft: 4 }),
      enqueuePost: async (post) => void enqueued.push(post),
    };
  }, 30_000);

  it("makes a reel and, in ask mode, proposes the post until the creator approves", async () => {
    plans.push({
      reply: "Bana rahi hoon aur kal shaam post karne ke liye puchungi.",
      actions: [
        { name: "make_reel", input: { idea: "Three chai hacks that make tea taste like a dhaba's.", format: "motion", durationSec: 30 } },
        { name: "post_reel", input: { reel: "N1", date: "2026-10-30", time: "19:30" } },
      ],
    });
    const { assistant } = await handleMessage(deps, turn, "chai hacks pe reel banao aur kal shaam post karo");
    const cards = cardsOf(assistant);
    expect(cards.map((c) => c.type)).toEqual(["reel", "proposal"]);
    // The creator's language and brand rules flow into the reel.
    expect(started[0]).toMatchObject({ format: "motion", language: "hi", quality: "standard", ending: "auto" });
    const proposal = cards[1] as Extract<AgentCard, { type: "proposal" }>;
    expect(proposal.text).toMatch(/to Instagram Fri, 30 Oct, 7:30 pm/i);
    expect(enqueued).toHaveLength(0);

    // Approving before the reel is ready: the post waits for it.
    const waiting = await decide(deps, turn, proposal.actionId, true);
    expect(cardsOf(waiting)[0]).toMatchObject({ type: "post", status: "waiting" });
    // A second tap doesn't post twice.
    expect((await decide(deps, turn, proposal.actionId, true)).text).toMatch(/already handled/);

    // The worker finishes the reel: the waiting post goes out with an AI caption.
    const reelId = (cards[0] as Extract<AgentCard, { type: "reel" }>).reelId;
    await updateFilm(db, reelId, { status: "completed", title: "3 chai hacks" });
    await onReelFinished(deps, reelId);
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]).toMatchObject({ title: "Chai hack", description: "Try this tonight!\n\n#chai #hack", tags: ["chai", "hack"] });
    expect(enqueued[0].scheduledAt.toISOString()).toBe("2026-10-30T14:00:00.000Z");

    // History shows the live state of each card.
    const history = await historyView(db, "u1");
    const proposalNow = history.flatMap((m) => m.cards).find((c) => c.type === "proposal");
    expect(proposalNow).toMatchObject({ status: "done" });
    expect(history.flatMap((m) => m.cards).find((c) => c.type === "reel")).toMatchObject({ status: "completed", title: "3 chai hacks" });
    expect(history.at(-1)?.cards[0]).toMatchObject({ type: "post", status: "scheduled" });
  });

  it("cancels a proposal without posting", async () => {
    const f = await createFilm(db, { userId: "u1", story: "A ready reel about chai.", style: "animated", durationSec: 30 });
    await updateFilm(db, f.id, { status: "completed" });
    plans.push({ reply: "Ok", actions: [{ name: "post_reel", input: { reel: "R1", now: true } }] });
    const { assistant } = await handleMessage(deps, turn, "post my last reel now");
    const proposal = cardsOf(assistant)[0] as Extract<AgentCard, { type: "proposal" }>;
    expect(proposal.text).toMatch(/as soon as it's ready/);
    await decide(deps, turn, proposal.actionId, false);
    expect((await historyView(db, "u1")).flatMap((m) => m.cards).find((c) => c.type === "proposal")).toMatchObject({ status: "cancelled" });
    expect(enqueued).toHaveLength(0);
  });

  it("posts on its own in auto modes, at the next evening slot when no time is given", async () => {
    const f = await createFilm(db, { userId: "u1", story: "A ready reel about chai.", style: "animated", durationSec: 30 });
    await updateFilm(db, f.id, { status: "completed", title: "Ready" });
    plans.push({ reply: "Done", actions: [{ name: "set_posting_mode", input: { mode: "auto_schedule" } }, { name: "post_reel", input: { reel: "R1" } }] });
    const { assistant } = await handleMessage(deps, turn, "from now on schedule automatically, and post my last reel");
    expect(await getPostingMode(db, "u1")).toBe("auto_schedule");
    expect(cardsOf(assistant).map((c) => c.type)).toEqual(["settings", "post"]);
    expect(enqueued[0].scheduledAt.toISOString()).toBe("2026-10-29T14:00:00.000Z");
    expect((await db.select().from(scheduledPost)).length).toBe(1);
  });

  it("plans a week: one reel a day, stopping when free reels and credits run out", async () => {
    await runAction(deps, turn, "set_posting_mode", { mode: "auto_schedule" });
    plans.push({ reply: "Pura hafta plan kar diya!", actions: [{ name: "make_week", input: { count: 4, post: true, format: "motion" } }] });
    const { assistant } = await handleMessage(deps, turn, "is hafte ke liye 4 reels banao aur roz post karo");
    const types = cardsOf(assistant).map((c) => c.type);
    // Three reels fit; the fourth asks for credits, and nothing more is attempted.
    expect(types).toEqual(["reel", "post", "reel", "post", "reel", "post", "credits"]);
    const waits = cardsOf(assistant).filter((c): c is Extract<AgentCard, { type: "post" }> => c.type === "post");
    expect(waits.map((c) => c.status)).toEqual(["waiting", "waiting", "waiting"]);
    expect(waits.map((c) => c.at)).toEqual(["2026-10-29T14:00:00.000Z", "2026-10-30T14:00:00.000Z", "2026-10-31T14:00:00.000Z"]);
  });

  it("asks to connect an account, refuses past times and unknown reels", async () => {
    await db.delete(socialAccount);
    const f = await createFilm(db, { userId: "u1", story: "A ready reel about chai.", style: "animated", durationSec: 30 });
    await updateFilm(db, f.id, { status: "completed" });
    plans.push({ reply: "", actions: [{ name: "post_reel", input: { reel: "R1" } }] });
    expect(cardsOf((await handleMessage(deps, turn, "post it")).assistant)[0]).toMatchObject({ type: "connect" });

    await db.insert(socialAccount).values({ userId: "u1", platform: "youtube", externalId: "yt1", name: "Chai TV", accessToken: "x", expiresAt: new Date() });
    plans.push({ reply: "", actions: [{ name: "post_reel", input: { reel: "R1", date: "2026-10-28", time: "10:00" } }, { name: "post_reel", input: { reel: "R9" } }] });
    const cards = cardsOf((await handleMessage(deps, turn, "post it yesterday")).assistant);
    expect(cards[0]).toMatchObject({ type: "error", text: expect.stringMatching(/already passed/) });
    expect(cards[1]).toMatchObject({ type: "error", text: expect.stringMatching(/couldn't find/) });
  });

  it("runs card buttons without the AI and ignores made-up actions", async () => {
    const msg = await runAction(deps, turn, "make_reel", { idea: "Chai hack 1. A quick chai trick that saves time.", title: "Chai hack 1", format: "story" }, "Make this: Chai hack 1");
    expect(cardsOf(msg)[0]).toMatchObject({ type: "reel", title: "Chai hack 1" });
    await expect(runAction(deps, turn, "delete_everything", {})).rejects.toThrow();

    plans.push({ reply: "Ideas!", actions: [{ name: "hack_instagram", input: {} }, { name: "suggest_ideas", input: { count: 2 } }, { name: "make_reel", input: { idea: "short" } }] });
    const cards = cardsOf((await handleMessage(deps, turn, "ideas do")).assistant);
    expect(cards[0]).toMatchObject({ type: "ideas" });
    expect((cards[0] as Extract<AgentCard, { type: "ideas" }>).ideas).toHaveLength(2);
    // A too-short idea is refused with a reason instead of a broken reel.
    expect(cards[1]).toMatchObject({ type: "error" });
  });

  it("falls back to a friendly message when the AI's answer isn't usable", async () => {
    plans.push("not json at all");
    const { assistant } = await handleMessage(deps, turn, "???");
    expect(assistant.text).toMatch(/didn't get that/);
    expect(cardsOf(assistant)).toEqual([]);
  });
});
