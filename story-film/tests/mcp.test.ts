import { beforeEach, describe, expect, it } from "vitest";
import type { AgentDeps } from "@/lib/agent/agent";
import { handleRpc, tools } from "@/lib/agent/mcp";
import { historyView } from "@/lib/agent/store";
import { createToken, listTokens, revokeToken, tokenOwner } from "@/lib/agent/tokens";
import type { Db } from "@/lib/db";
import { apiToken, socialAccount, user } from "@/lib/db/schema";
import { createFilm, updateFilm } from "@/lib/films";
import type { Post } from "@/lib/posts";
import type { LlmProvider } from "@/lib/providers/types";
import { testDb } from "./helpers/db";

const NOW = new Date("2026-10-29T10:00:00Z");

describe("Reelkar connector (MCP)", { timeout: 30_000 }, () => {
  let db: Db;
  let deps: AgentDeps;
  let enqueued: Post[];
  const turn = { userId: "u1", timeZone: "Asia/Kolkata" };
  const llm = {
    modelId: "llama-3.3-70b",
    completeJson: async (prompt: string) =>
      prompt.includes("Suggest 6 ideas")
        ? { ideas: [{ title: "Chai hack", idea: "A quick chai trick that saves time every morning." }] }
        : { title: "Chai hack", caption: "Try this!", hashtags: ["#chai"] },
  } as unknown as LlmProvider;
  const call = (name: string, args: unknown = {}, id = 1) => handleRpc(deps, turn, { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }, "Claude");
  const textOf = (r: unknown) => (r as { result: { content: { text: string }[] } }).result.content[0].text;

  beforeEach(async () => {
    db = await testDb();
    const now = new Date();
    await db.insert(user).values({ id: "u1", name: "One", email: "one@example.com", createdAt: now, updatedAt: now });
    await db.insert(socialAccount).values({ userId: "u1", platform: "instagram", externalId: "ig1", name: "@chaiwala", accessToken: "x", expiresAt: new Date(Date.now() + 86400_000) });
    enqueued = [];
    deps = {
      db,
      llm,
      now: () => NOW,
      freeReelsLeft: async () => 3,
      startFilm: async (userId, body) => {
        const b = body as { story: string; format: "story" | "motion" };
        const f = await createFilm(db, { userId, story: b.story, style: "animated", durationSec: 30, format: b.format });
        return { id: f.id, credits: 0 };
      },
      rerenderEdit: async () => ({ rendersLeft: 4 }),
      enqueuePost: async (p) => void enqueued.push(p),
    };
  });

  it("issues keys that are stored hashed, can be revoked, and remember the time zone", async () => {
    const { token, view } = await createToken(db, "u1", "Claude on my laptop", "Asia/Dubai");
    expect(token).toMatch(/^rk_/);
    expect(view.hint).toBe(token.slice(-4));
    const [row] = await db.select().from(apiToken);
    expect(row.tokenHash).not.toContain(token);
    expect(await tokenOwner(db, token)).toEqual({ userId: "u1", timeZone: "Asia/Dubai" });
    expect((await listTokens(db, "u1"))[0].lastUsedAt).not.toBeNull();
    expect(await tokenOwner(db, "rk_wrong")).toBeNull();
    expect(await tokenOwner(db, "not-a-key")).toBeNull();
    expect(await revokeToken(db, "someone-else", view.id)).toBe(false);
    expect(await revokeToken(db, "u1", view.id)).toBe(true);
    expect(await tokenOwner(db, token)).toBeNull();
  });

  it("introduces itself and lists every action as a tool, with optional fields left optional", async () => {
    const init = (await handleRpc(deps, turn, { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {} } })) as { result: Record<string, unknown> };
    expect(init.result).toMatchObject({ protocolVersion: "2025-06-18", serverInfo: { name: "reelkar" }, capabilities: { tools: {} } });
    expect(await handleRpc(deps, turn, { jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();

    const list = tools();
    expect(list.map((t) => t.name)).toEqual(expect.arrayContaining(["suggest_ideas", "make_reel", "make_week", "post_reel", "list_reels", "answer_proposal"]));
    const make = list.find((t) => t.name === "make_reel")!;
    expect(make.inputSchema.required).toEqual(["idea"]);
    expect(make.inputSchema.properties?.durationSec).toMatchObject({ enum: [15, 30, 60] });
    expect(list.find((t) => t.name === "list_reels")!.annotations.readOnlyHint).toBe(true);
    expect(await handleRpc(deps, turn, { jsonrpc: "2.0", id: 2, method: "resources/list" })).toMatchObject({ error: { code: -32601 } });
  });

  it("makes a reel, proposes the post, and posts once the creator approves through the assistant", async () => {
    const made = textOf(await call("make_reel", { idea: "Three chai hacks that make tea taste like a dhaba's.", title: "3 chai hacks" }));
    const reelId = made.match(/id ([0-9a-f-]{36})/)![1];
    expect(made).toContain('Reel "3 chai hacks"');

    await updateFilm(db, reelId, { status: "completed", title: "3 chai hacks" });
    const proposed = textOf(await call("post_reel", { reel: reelId, date: "2026-10-30", time: "19:30" }));
    const proposalId = proposed.match(/proposal id ([0-9a-f-]{36})/)![1];
    expect(proposed).toMatch(/Needs the creator's approval/);
    expect(enqueued).toHaveLength(0);

    const posted = textOf(await call("answer_proposal", { proposal_id: proposalId, approve: true }));
    expect(posted).toMatch(/Scheduled “3 chai hacks” on Instagram/);
    expect(enqueued).toHaveLength(1);

    // The creator sees what the assistant did in Ask Reelkar.
    const history = await historyView(db, "u1");
    expect(history.some((m) => m.text === "Via Claude: make reel")).toBe(true);
  });

  it("explains problems instead of failing silently", async () => {
    const bad = (await call("make_reel", { idea: "too short" })) as { result: { isError: boolean; content: { text: string }[] } };
    expect(bad.result.isError).toBe(true);
    expect(bad.result.content[0].text).toMatch(/Problem:/);
    expect(await call("delete_everything")).toMatchObject({ result: { isError: true } });
    expect(await call("answer_proposal", { approve: true })).toMatchObject({ result: { isError: true } });
    expect(await handleRpc(deps, turn, { method: "tools/list" } as never)).toMatchObject({ error: { code: -32600 } });

    const f = await createFilm(db, { userId: "u1", story: "A ready reel about chai.", style: "animated", durationSec: 30 });
    await updateFilm(db, f.id, { status: "completed" });
    const listed = textOf(await call("list_reels"));
    expect(listed).toContain(`R1: "A ready reel about chai." (id ${f.id}`);
  });
});
