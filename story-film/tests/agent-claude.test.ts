import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { ActionName } from "@/lib/agent/actions";
import type { AgentCard } from "@/lib/agent/cards";
import { ClaudeToolPlanner } from "@/lib/agent/claude";

type Block = Record<string, unknown>;

// The Messages API, replaying canned replies and recording each request.
function fakeClaude(...replies: { content: Block[]; stop_reason: string }[]) {
  const requests: Record<string, unknown>[] = [];
  const fetch = (async (_url: string, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)));
    const reply = replies[requests.length - 1];
    return Response.json({ id: `msg_${requests.length}`, type: "message", role: "assistant", model: "claude-haiku-5-5", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 }, ...reply });
  }) as unknown as typeof globalThis.fetch;
  return { client: new Anthropic({ apiKey: "test", fetch, maxRetries: 0 }), requests };
}

const toolUse = (id: string, name: string, input: unknown): Block => ({ type: "tool_use", id, name, input });

function recorder(cards: (name: ActionName) => AgentCard[]) {
  const calls: { name: ActionName; input: unknown }[] = [];
  return { calls, act: async (name: ActionName, input: unknown) => (calls.push({ name, input }), cards(name)) };
}

const base = { system: "You are Ask Reelkar.", history: [], message: "Free reels left this week: 2\n\nCreator: make a chai reel" };

describe("Ask Reelkar on Claude", () => {
  it("calls actions as tools, sees what they did, then replies", async () => {
    const { client, requests } = fakeClaude(
      { content: [toolUse("t1", "make_reel", { idea: "Three chai hacks for rainy mornings in Mumbai.", format: "motion" })], stop_reason: "tool_use" },
      { content: [{ type: "text", text: "Bana rahi hoon! Ek minute lagega." }], stop_reason: "end_turn" },
    );
    const { calls, act } = recorder(() => [{ type: "reel", reelId: "f1", title: "Chai hacks", status: "queued" }]);

    const reply = await new ClaudeToolPlanner(client).respond({ ...base, act });

    expect(reply).toBe("Bana rahi hoon! Ek minute lagega.");
    expect(calls).toEqual([{ name: "make_reel", input: { idea: "Three chai hacks for rainy mornings in Mumbai.", format: "motion" } }]);
    // Claude reads back what the action did, as the connector describes it.
    const toolResult = JSON.stringify((requests[1].messages as Block[]).at(-1));
    expect(toolResult).toContain('Reel \\"Chai hacks\\" (id f1): queued');

    const first = requests[0];
    expect(first.model).toBe("claude-haiku-5-5");
    expect(first.output_config).toEqual({ effort: "low" });
    expect((first.system as Block[])[0]).toMatchObject({ text: "You are Ask Reelkar.", cache_control: { type: "ephemeral" } });
    const names = (first.tools as { name: string }[]).map((t) => t.name);
    expect(names).toContain("post_reel");
    // Connector-only tools and proposal answers stay with the connector; approvals are buttons in the app.
    expect(names).not.toContain("make_reel_from_script");
    expect(names).not.toContain("answer_proposal");
  });

  it("runs the calls in one reply one at a time, in Claude's order", async () => {
    const { client } = fakeClaude(
      { content: [toolUse("t1", "make_reel", { idea: "Three chai hacks for rainy mornings in Mumbai." }), toolUse("t2", "post_reel", { reel: "N1" })], stop_reason: "tool_use" },
      { content: [{ type: "text", text: "Done." }], stop_reason: "end_turn" },
    );
    const log: string[] = [];
    const act = async (name: ActionName) => {
      log.push(`start ${name}`);
      // make_reel is the slow one; post_reel must still wait for it, since "N1" is the reel it makes.
      await new Promise((r) => setTimeout(r, name === "make_reel" ? 30 : 0));
      log.push(`end ${name}`);
      return [] as AgentCard[];
    };
    await new ClaudeToolPlanner(client).respond({ ...base, act });
    expect(log).toEqual(["start make_reel", "end make_reel", "start post_reel", "end post_reel"]);
  });

  it("tells Claude when an action fails, and carries on", async () => {
    const { client, requests } = fakeClaude(
      { content: [toolUse("t1", "list_reels", {}), toolUse("t2", "suggest_ideas", {})], stop_reason: "tool_use" },
      { content: [{ type: "text", text: "Here are ideas." }], stop_reason: "end_turn" },
    );
    const { calls, act } = recorder((name) => {
      if (name === "list_reels") throw new Error("database down");
      return [{ type: "ideas", ideas: [], format: "motion" }];
    });
    expect(await new ClaudeToolPlanner(client).respond({ ...base, act })).toBe("Here are ideas.");
    expect(calls.map((c) => c.name)).toEqual(["list_reels", "suggest_ideas"]);
    expect(JSON.stringify((requests[1].messages as Block[]).at(-1))).toContain('"is_error":true');
  });

  it("stops after 5 actions in one message", async () => {
    const { client } = fakeClaude(
      { content: Array.from({ length: 6 }, (_, i) => toolUse(`t${i}`, "list_reels", {})), stop_reason: "tool_use" },
      { content: [{ type: "text", text: "Done." }], stop_reason: "end_turn" },
    );
    const { calls, act } = recorder(() => [{ type: "reels", reels: [] }]);
    await new ClaudeToolPlanner(client).respond({ ...base, act });
    expect(calls).toHaveLength(5);
  });

  it("passes earlier turns as chat, starting with the creator", async () => {
    const { client, requests } = fakeClaude({ content: [{ type: "text", text: "Kaunsa reel?" }], stop_reason: "end_turn" });
    const { act } = recorder(() => []);
    await new ClaudeToolPlanner(client).respond({
      ...base,
      history: [
        { role: "assistant", text: "[Reel “Old” queued]" },
        { role: "user", text: "make one" },
        { role: "assistant", text: "" },
        { role: "assistant", text: "Ok [Reel “Chai” queued]" },
      ],
      act,
    });
    expect(requests[0].messages).toEqual([
      { role: "user", content: "make one" },
      { role: "assistant", content: "Ok [Reel “Chai” queued]" },
      { role: "user", content: base.message },
    ]);
  });

  it("answers plainly when Claude declines", async () => {
    const { client } = fakeClaude({ content: [], stop_reason: "refusal" });
    expect(await new ClaudeToolPlanner(client).respond({ ...base, act: recorder(() => []).act })).toMatch(/can't help/);
  });

  it("refuses models that aren't on the license allowlist", () => {
    expect(() => new ClaudeToolPlanner(fakeClaude().client, "some-unreviewed-model")).toThrow(/allowlist/);
  });
});
