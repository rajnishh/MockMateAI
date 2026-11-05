import { describe, expect, it } from "vitest";
import type { ActionName } from "@/lib/agent/actions";
import type { AgentCard } from "@/lib/agent/cards";
import { GeminiToolPlanner } from "@/lib/agent/gemini";

type Part = Record<string, unknown>;
type Body = { contents: { role: string; parts: Part[] }[]; tools: { functionDeclarations: { name: string }[] }[]; systemInstruction: unknown };

// Gemini's generateContent, replaying canned replies (or statuses) and recording each request.
function fakeGemini(...replies: ({ parts: Part[]; finishReason?: string } | number)[]) {
  const requests: { url: string; headers: Record<string, string>; body: Body }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    requests.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    const reply = replies[requests.length - 1];
    if (typeof reply === "number") return new Response("busy", { status: reply });
    return Response.json({ candidates: [{ content: { role: "model", parts: reply.parts }, finishReason: reply.finishReason ?? "STOP" }] });
  }) as unknown as typeof fetch;
  return { fetchFn, requests };
}

const call = (name: string, args: unknown, extra: Part = {}): Part => ({ functionCall: { name, args }, ...extra });

function recorder(cards: (name: ActionName) => AgentCard[]) {
  const calls: { name: ActionName; input: unknown }[] = [];
  return { calls, act: async (name: ActionName, input: unknown) => (calls.push({ name, input }), cards(name)) };
}

const base = { system: "You are Ask Reelkar.", history: [], message: "Free reels left this week: 2\n\nCreator: make a chai reel" };

describe("Ask Reelkar on Gemini", () => {
  it("calls actions as tools, sends back what they did, then replies", async () => {
    const { fetchFn, requests } = fakeGemini(
      { parts: [call("make_reel", { idea: "Three chai hacks for rainy mornings in Mumbai." }, { thoughtSignature: "sig1" })] },
      { parts: [{ text: "Thinking it over", thought: true }, { text: "Bana rahi hoon! Ek minute lagega." }] },
    );
    const { calls, act } = recorder(() => [{ type: "reel", reelId: "f1", title: "Chai hacks", status: "queued" }]);

    const reply = await new GeminiToolPlanner("key", undefined, fetchFn).respond({ ...base, act });

    expect(reply).toBe("Bana rahi hoon! Ek minute lagega.");
    expect(calls).toEqual([{ name: "make_reel", input: { idea: "Three chai hacks for rainy mornings in Mumbai." } }]);
    expect(requests[0].url).toContain("/models/gemini-3.5-flash:generateContent");
    expect(requests[0].headers["x-goog-api-key"]).toBe("key");
    expect(requests[0].body.systemInstruction).toEqual({ parts: [{ text: "You are Ask Reelkar." }] });
    const names = requests[0].body.tools[0].functionDeclarations.map((t) => t.name);
    expect(names).toContain("post_reel");
    expect(names).not.toContain("make_reel_from_script");
    expect(names).not.toContain("answer_proposal");
    // Gemini's own turn goes back as it was (thought signature included), then what the action did.
    const [, model, result] = requests[1].body.contents;
    expect(model).toEqual({ role: "model", parts: [call("make_reel", { idea: "Three chai hacks for rainy mornings in Mumbai." }, { thoughtSignature: "sig1" })] });
    expect(JSON.stringify(result)).toContain('Reel \\"Chai hacks\\" (id f1): queued');
  });

  it("runs the calls in one reply one at a time, in Gemini's order", async () => {
    const { fetchFn } = fakeGemini({ parts: [call("make_reel", { idea: "Three chai hacks for rainy mornings in Mumbai." }), call("post_reel", { reel: "N1" })] }, { parts: [{ text: "Done." }] });
    const log: string[] = [];
    const act = async (name: ActionName) => {
      log.push(`start ${name}`);
      await new Promise((r) => setTimeout(r, name === "make_reel" ? 30 : 0));
      log.push(`end ${name}`);
      return [] as AgentCard[];
    };
    await new GeminiToolPlanner("key", undefined, fetchFn).respond({ ...base, act });
    expect(log).toEqual(["start make_reel", "end make_reel", "start post_reel", "end post_reel"]);
  });

  it("tells Gemini when an action fails, and carries on", async () => {
    const { fetchFn, requests } = fakeGemini({ parts: [call("list_reels", {}), call("suggest_ideas", {})] }, { parts: [{ text: "Here are ideas." }] });
    const { calls, act } = recorder((name) => {
      if (name === "list_reels") throw new Error("database down");
      return [{ type: "ideas", ideas: [], format: "motion" }];
    });
    expect(await new GeminiToolPlanner("key", undefined, fetchFn).respond({ ...base, act })).toBe("Here are ideas.");
    expect(calls.map((c) => c.name)).toEqual(["list_reels", "suggest_ideas"]);
    expect(JSON.stringify(requests[1].body.contents.at(-1))).toContain('"error":"database down"');
  });

  it("stops after 5 actions in one message", async () => {
    const { fetchFn } = fakeGemini({ parts: Array.from({ length: 6 }, () => call("list_reels", {})) }, { parts: [{ text: "Done." }] });
    const { calls, act } = recorder(() => [{ type: "reels", reels: [] }]);
    await new GeminiToolPlanner("key", undefined, fetchFn).respond({ ...base, act });
    expect(calls).toHaveLength(5);
  });

  it("passes earlier turns as chat, starting with the creator", async () => {
    const { fetchFn, requests } = fakeGemini({ parts: [{ text: "Kaunsa reel?" }] });
    await new GeminiToolPlanner("key", undefined, fetchFn).respond({
      ...base,
      history: [
        { role: "assistant", text: "[Reel “Old” queued]" },
        { role: "user", text: "make one" },
        { role: "assistant", text: "" },
        { role: "assistant", text: "Ok [Reel “Chai” queued]" },
      ],
      act: recorder(() => []).act,
    });
    expect(requests[0].body.contents).toEqual([
      { role: "user", parts: [{ text: "make one" }] },
      { role: "model", parts: [{ text: "Ok [Reel “Chai” queued]" }] },
      { role: "user", parts: [{ text: base.message }] },
    ]);
  });

  it("answers plainly when Gemini blocks the reply", async () => {
    const { fetchFn } = fakeGemini({ parts: [], finishReason: "SAFETY" });
    expect(await new GeminiToolPlanner("key", undefined, fetchFn).respond({ ...base, act: recorder(() => []).act })).toMatch(/can't help/);
  });

  it("retries a server error once, and throws when the free limit is reached", async () => {
    const retried = fakeGemini(503, { parts: [{ text: "Hi!" }] });
    expect(await new GeminiToolPlanner("key", undefined, retried.fetchFn).respond({ ...base, act: recorder(() => []).act })).toBe("Hi!");
    const limited = fakeGemini(429);
    await expect(new GeminiToolPlanner("key", undefined, limited.fetchFn).respond({ ...base, act: recorder(() => []).act })).rejects.toThrow(/Gemini 429/);
    expect(limited.requests).toHaveLength(1);
  });

  it("accepts newer Gemini models, which share one license entry", () => {
    expect(() => new GeminiToolPlanner("key", "gemini-flash-latest")).not.toThrow();
  });
});
