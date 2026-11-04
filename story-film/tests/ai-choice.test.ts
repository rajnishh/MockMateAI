import { beforeEach, describe, expect, it } from "vitest";
import type { ActionName } from "@/lib/agent/actions";
import { keyProblem } from "@/lib/agent/ai-choice";
import { aiChoiceView, creatorPlanner, offeredProviders, saveAiChoice } from "@/lib/agent/ai-planner";
import type { AgentCard } from "@/lib/agent/cards";
import { OpenAiToolPlanner } from "@/lib/agent/openai-tools";
import { getAiChoice } from "@/lib/agent/store";
import type { Db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import type { Env } from "@/lib/env";
import { testDb } from "./helpers/db";

const ENV = { TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") } as Env;
const KEY = "AIzaSy-test-key-abcd";

// Answers every request with the same status; records each one.
function fakeApi(status = 200) {
  const requests: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    requests.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    if (status !== 200) return new Response("no", { status });
    return Response.json(
      url.includes("generativelanguage")
        ? { candidates: [{ content: { role: "model", parts: [{ text: "OK" }] }, finishReason: "STOP" }] }
        : { choices: [{ message: { content: "OK" }, finish_reason: "stop" }] },
    );
  }) as unknown as typeof fetch;
  return { fetchFn, requests };
}

describe("choosing Ask Reelkar's AI", { timeout: 30_000 }, () => {
  let db: Db;
  beforeEach(async () => {
    db = await testDb();
    const now = new Date();
    await db.insert(user).values({ id: "u1", name: "One", email: "one@example.com", createdAt: now, updatedAt: now });
  });

  it("offers Ollama only when the server runs one, and own keys only when they can be encrypted", () => {
    expect(offeredProviders(ENV).map((p) => p.id)).toEqual(["reelkar", "gemini", "groq", "openrouter", "claude"]);
    expect(offeredProviders({ ...ENV, OLLAMA_URL: "http://localhost:11434" }).map((p) => p.id)).toContain("ollama");
    expect(offeredProviders({} as Env).map((p) => p.id)).toEqual(["reelkar"]);
  });

  it("starts on Reelkar free", async () => {
    expect(await aiChoiceView(db, ENV, "u1")).toMatchObject({ provider: "reelkar", model: null, keyHint: null, ownKeys: true });
    expect(await creatorPlanner(db, ENV, "u1")).toBeUndefined();
  });

  it("checks the key, then keeps it encrypted and shows only its last 4 characters", async () => {
    const { fetchFn, requests } = fakeApi();
    await saveAiChoice(db, ENV, "u1", { provider: "gemini", model: "gemini-2.5-flash", key: KEY }, fetchFn);
    expect(requests).toHaveLength(1);
    expect(requests[0].headers["x-goog-api-key"]).toBe(KEY);

    const stored = await getAiChoice(db, "u1");
    expect(stored.key).toBeTruthy();
    expect(stored.key).not.toContain(KEY);
    const view = await aiChoiceView(db, ENV, "u1");
    expect(view).toMatchObject({ provider: "gemini", model: "gemini-2.5-flash", keyHint: "…abcd" });
    expect(JSON.stringify(view)).not.toContain(KEY);

    const own = await creatorPlanner(db, ENV, "u1");
    expect(own).toMatchObject({ name: "Google Gemini", provider: "gemini" });
    expect(own?.planner.modelId).toBe("gemini-2.5-flash");
  });

  it("keeps the saved key when only the model changes", async () => {
    await saveAiChoice(db, ENV, "u1", { provider: "gemini", model: "gemini-2.5-flash", key: KEY }, fakeApi().fetchFn);
    const { fetchFn, requests } = fakeApi();
    await saveAiChoice(db, ENV, "u1", { provider: "gemini", model: "gemini-2.5-pro" }, fetchFn);
    expect(requests[0].headers["x-goog-api-key"]).toBe(KEY);
    expect(await aiChoiceView(db, ENV, "u1")).toMatchObject({ model: "gemini-2.5-pro", keyHint: "…abcd" });
  });

  it("says plainly when a key doesn't work, and saves nothing", async () => {
    await expect(saveAiChoice(db, ENV, "u1", { provider: "groq", model: "llama-3.3-70b-versatile", key: "bad" }, fakeApi(401).fetchFn)).rejects.toThrow(
      "That Groq key didn't work. Check it was copied in full.",
    );
    expect((await getAiChoice(db, "u1")).provider).toBe("reelkar");
  });

  it("needs a key, a listed model where there's a fixed list, and an Ollama server", async () => {
    await expect(saveAiChoice(db, ENV, "u1", { provider: "claude", model: "claude-haiku-5-5" }, fakeApi().fetchFn)).rejects.toThrow(/Add your Anthropic Claude key/);
    await expect(saveAiChoice(db, ENV, "u1", { provider: "gemini", model: "gemini-0-ultra", key: KEY }, fakeApi().fetchFn)).rejects.toThrow(/Pick one of the Google Gemini models/);
    await expect(saveAiChoice(db, ENV, "u1", { provider: "ollama", model: "qwen3:8b" }, fakeApi().fetchFn)).rejects.toThrow(/Pick an AI from the list/);
  });

  it("lets OpenRouter and Groq use any model id, and Ollama runs without a key", async () => {
    const or = fakeApi();
    await saveAiChoice(db, ENV, "u1", { provider: "openrouter", model: "qwen/qwen3-235b-a22b:free", key: "sk-or-1234" }, or.fetchFn);
    expect(or.requests[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(or.requests[0].body.model).toBe("qwen/qwen3-235b-a22b:free");
    expect(or.requests[0].headers.Authorization).toBe("Bearer sk-or-1234");

    const env = { ...ENV, OLLAMA_URL: "http://localhost:11434/" };
    const ol = fakeApi();
    await saveAiChoice(db, env, "u1", { provider: "ollama", model: "qwen3:8b" }, ol.fetchFn);
    expect(ol.requests[0].url).toBe("http://localhost:11434/v1/chat/completions");
    expect(ol.requests[0].headers.Authorization).toBeUndefined();
    expect(await aiChoiceView(db, env, "u1")).toMatchObject({ provider: "ollama", keyHint: null });
    // Without the server any more, the creator is back on Reelkar free.
    expect(await creatorPlanner(db, ENV, "u1")).toBeUndefined();
    expect((await aiChoiceView(db, ENV, "u1")).provider).toBe("reelkar");
  });

  it("goes back to Reelkar free and forgets the key", async () => {
    await saveAiChoice(db, ENV, "u1", { provider: "gemini", model: "gemini-2.5-flash", key: KEY }, fakeApi().fetchFn);
    await saveAiChoice(db, ENV, "u1", { provider: "reelkar" });
    expect(await getAiChoice(db, "u1")).toEqual({ provider: "reelkar", model: null, key: null, keyHint: null });
  });
});

describe("Ask Reelkar on an OpenAI-style API (OpenRouter, Groq, Ollama)", () => {
  type Msg = Record<string, unknown>;
  function replies(...rs: { content?: string; tool_calls?: unknown[] }[]) {
    const bodies: { messages: Msg[]; tools: { function: { name: string } }[] }[] = [];
    const fetchFn = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return Response.json({ choices: [{ message: rs[bodies.length - 1], finish_reason: "stop" }] });
    }) as unknown as typeof fetch;
    return { fetchFn, bodies };
  }
  const call = (id: string, name: string, args: unknown) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });

  it("runs the actions it asks for in order, sends back what they did, then replies", async () => {
    const { fetchFn, bodies } = replies(
      { content: null as unknown as string, tool_calls: [call("c1", "make_reel", { idea: "Three chai hacks for rainy mornings in Mumbai." }), call("c2", "post_reel", { reel: "N1" })] },
      { content: "Bana rahi hoon!" },
    );
    const log: string[] = [];
    const act = async (name: ActionName) => {
      log.push(`start ${name}`);
      await new Promise((r) => setTimeout(r, name === "make_reel" ? 20 : 0));
      log.push(`end ${name}`);
      return [{ type: "reel", reelId: "f1", title: "Chai hacks", status: "queued" }] as AgentCard[];
    };
    const reply = await new OpenAiToolPlanner("https://api.groq.com/openai/v1", "k", "llama-3.3-70b-versatile", "groq", fetchFn).respond({
      system: "You are Ask Reelkar.",
      history: [{ role: "assistant", text: "hi" }, { role: "user", text: "make one" }],
      message: "Creator: chai reel",
      act,
    });
    expect(reply).toBe("Bana rahi hoon!");
    expect(log).toEqual(["start make_reel", "end make_reel", "start post_reel", "end post_reel"]);
    expect(bodies[0].messages).toEqual([
      { role: "system", content: "You are Ask Reelkar." },
      { role: "user", content: "make one" },
      { role: "user", content: "Creator: chai reel" },
    ]);
    const names = bodies[0].tools.map((t) => t.function.name);
    expect(names).toContain("post_reel");
    expect(names).not.toContain("answer_proposal");
    expect(bodies[1].messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "c2" });
    expect(JSON.stringify(bodies[1].messages.at(-2))).toContain('Reel \\"Chai hacks\\" (id f1): queued');
  });

  it("tells the model about broken tool input instead of running it", async () => {
    const { fetchFn, bodies } = replies({ tool_calls: [{ id: "c1", type: "function", function: { name: "list_reels", arguments: "{oops" } }] }, { content: "Sorry!" });
    const calls: string[] = [];
    await new OpenAiToolPlanner("https://openrouter.ai/api/v1", "k", "any/model", "openrouter", fetchFn).respond({
      system: "s",
      history: [],
      message: "m",
      act: async (name) => (calls.push(name), []),
    });
    expect(calls).toEqual([]);
    expect(String(bodies[1].messages.at(-1)?.content)).toMatch(/^Error: .*valid JSON/);
  });
});

describe("why a creator's AI didn't answer", () => {
  it("puts provider errors in plain words", () => {
    expect(keyProblem(Object.assign(new Error("x"), { status: 401 }), "Groq")).toBe("That Groq key didn't work. Check it was copied in full.");
    expect(keyProblem(new Error("Gemini 429: quota"), "Google Gemini")).toBe("This Google Gemini key has hit its limit for now. Try again later.");
    expect(keyProblem(new Error("fetch failed"), "OpenRouter")).toBe("Couldn't reach OpenRouter. Try again in a minute.");
    expect(keyProblem(undefined, "OpenRouter")).toBe("Couldn't reach OpenRouter. Try again in a minute.");
  });
});
