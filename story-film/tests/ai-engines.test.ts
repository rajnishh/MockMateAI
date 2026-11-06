import { beforeEach, describe, expect, it } from "vitest";
import { ChainLlm, ChainPlanner, type Link, MemoryRestStore, nextUtcMidnight, restFor } from "@/lib/ai/chain";
import { addEngine, changeEngine, enginesView, llmForUser, offeredProviders, reorderEngines } from "@/lib/ai/engines";
import type { ToolPlanner } from "@/lib/agent/claude";
import type { Db } from "@/lib/db";
import { aiEngine } from "@/lib/db/app-schema";
import { user } from "@/lib/db/schema";
import type { Env } from "@/lib/env";
import { buildLlm, reelkarLane } from "@/lib/providers";
import type { LlmProvider } from "@/lib/providers/types";
import { testDb } from "./helpers/db";

const ENV = {
  GEMINI_LLM_MODEL: "gemini-3.5-flash",
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  CLOUDFLARE_ACCOUNT_ID: "acc",
  CLOUDFLARE_API_TOKEN: "cf",
  GEMINI_API_KEY: "owner-gemini",
} as Env;
const KEY = "AIzaSy-test-key-abcd";

// An OpenAI-style API that answers with `status`; records each request.
function fakeApi(status = 200) {
  const requests: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    requests.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    if (status !== 200) return new Response(status === 429 ? "daily quota exhausted" : "no", { status });
    return Response.json({ choices: [{ message: { content: '{"ok": true}' }, finish_reason: "stop" }] });
  }) as unknown as typeof fetch;
  return { fetchFn, requests };
}

// A text engine that fails with an HTTP status, or answers.
function engine(name: string, status?: number): Link<LlmProvider> & { calls: number } {
  const link = {
    id: `user:${name}`,
    name,
    calls: 0,
    engine: {
      modelId: "groq",
      writeScript: async () => {
        throw new Error("unused");
      },
      completeJson: async () => {
        link.calls++;
        if (status) throw new Error(`LLM ${status}: ${status === 429 ? "you have used up your daily free allocation" : "nope"}`);
        return { from: name };
      },
    },
  };
  return link;
}

describe("auto-switching between AI engines", () => {
  it("rests an engine that used up its daily allowance until midnight UTC, and the next one answers", async () => {
    const rests = new MemoryRestStore();
    const tired = engine("tired", 429);
    const fresh = engine("fresh");
    const chain = new ChainLlm([tired, fresh], rests);
    expect(await chain.completeJson("x")).toEqual({ from: "fresh" });
    expect((await rests.get("user:tired"))?.reason).toBe("limit");

    // The next task goes straight to the next engine.
    await chain.completeJson("y");
    expect(tired.calls).toBe(1);
    expect(fresh.calls).toBe(2);
  });

  it("tells a daily limit from a per-minute one, a bad key and an outage", () => {
    const now = Date.UTC(2026, 10, 5, 16, 0);
    expect(restFor(new Error("LLM 429: you have used up your daily free allocation of 10,000 neurons"), now)).toEqual({ reason: "limit", until: nextUtcMidnight(now) });
    expect(restFor(new Error("LLM 429: rate limit reached, try again in 20s"), now)).toEqual({ reason: "limit", until: now + 2 * 60_000 });
    expect(restFor(new Error("LLM 401: invalid api key"), now)?.reason).toBe("key");
    expect(restFor(new Error("LLM 503: overloaded"), now)).toBeNull();
    expect(nextUtcMidnight(now)).toBe(Date.UTC(2026, 10, 6));
  });

  it("still tries every engine when all of them are resting", async () => {
    const rests = new MemoryRestStore();
    await rests.set("user:a", { reason: "limit", until: Date.now() + 60_000 });
    expect(await new ChainLlm([engine("a")], rests).completeJson("x")).toEqual({ from: "a" });
  });

  it("hands a chat over only if nothing was done yet", async () => {
    const failing = (actFirst: boolean): Link<ToolPlanner> => ({
      id: "user:first",
      name: "first",
      engine: {
        modelId: "groq",
        respond: async (input) => {
          if (actFirst) await input.act("suggest_ideas", {});
          throw new Error("LLM 429: daily limit");
        },
      },
    });
    const second: Link<ToolPlanner> = { id: "user:second", name: "second", engine: { modelId: "groq", respond: async () => "from second" } };
    const input = { system: "", history: [], message: "hi", act: async () => [] };
    expect(await new ChainPlanner([failing(false), second], new MemoryRestStore()).respond(input)).toBe("from second");
    await expect(new ChainPlanner([failing(true), second], new MemoryRestStore()).respond(input)).rejects.toThrow(/429/);
  });

  it("builds Reelkar's own lane from the owner's keys: Workers AI, then Gemini", () => {
    const lane = buildLlm(ENV, new MemoryRestStore()) as ChainLlm;
    expect(lane.links.map((l) => l.id)).toEqual(["lane:cloudflare", "lane:gemini"]);
    expect((buildLlm({ ...ENV, GROQ_API_KEY: "g" }, new MemoryRestStore()) as ChainLlm).links.map((l) => l.id)).toContain("lane:groq");
  });

  it("puts the owner's Ollama last in Reelkar's lane, and it works on its own", async () => {
    const ollama = { OLLAMA_URL: "http://127.0.0.1:11434/", OLLAMA_LLM_MODEL: "gemma3:12b" };
    const ids = (buildLlm({ ...ENV, GROQ_API_KEY: "g", ...ollama }, new MemoryRestStore()) as ChainLlm).links.map((l) => l.id);
    expect(ids).toEqual(["lane:cloudflare", "lane:gemini", "lane:groq", "lane:ollama"]);

    const { fetchFn, requests } = fakeApi();
    const lane = reelkarLane(ollama as Env, fetchFn);
    expect(lane.map((l) => l.name)).toEqual(["Reelkar (this computer)"]);
    expect(lane[0].engine.modelId).toBe("ollama");
    expect(await lane[0].engine.completeJson("hi")).toEqual({ ok: true });
    expect(requests[0].url).toBe("http://127.0.0.1:11434/v1/chat/completions");
    expect(requests[0].body).toMatchObject({ model: "gemma3:12b", response_format: { type: "json_object" } });
  });

  it("falls back to the owner's Ollama when every key in the lane has run out", async () => {
    const rests = new MemoryRestStore();
    const tomorrow = Date.now() + 3_600_000;
    for (const id of ["lane:cloudflare", "lane:gemini"]) await rests.set(id, { reason: "limit", until: tomorrow });
    const { fetchFn, requests } = fakeApi();
    const chain = new ChainLlm(reelkarLane({ ...ENV, OLLAMA_URL: "http://127.0.0.1:11434", OLLAMA_LLM_MODEL: "gemma3:12b" }, fetchFn), rests);
    expect(await chain.completeJson("lyrics please")).toEqual({ ok: true });
    expect(requests.map((r) => r.url)).toEqual(["http://127.0.0.1:11434/v1/chat/completions"]);
  });
});

describe("a creator's own AI engines", { timeout: 30_000 }, () => {
  let db: Db;
  beforeEach(async () => {
    db = await testDb();
    const now = new Date();
    await db.insert(user).values({ id: "u1", name: "One", email: "one@example.com", createdAt: now, updatedAt: now });
  });

  it("offers Ollama only when the server runs one, and own keys only when they can be encrypted", () => {
    expect(offeredProviders(ENV).map((p) => p.id)).toEqual(["gemini", "groq", "cerebras", "mistral", "cloudflare", "openrouter", "claude"]);
    const withOllama = offeredProviders({ ...ENV, OLLAMA_URL: "http://localhost:11434" });
    expect(withOllama.map((p) => p.id)).toContain("ollama");
    expect(withOllama.find((p) => p.id === "ollama")?.models[0].id).toBe("gemma3:12b");
    expect(offeredProviders({} as Env)).toEqual([]);
  });

  it("checks a key before saving it, keeps it encrypted and shows only its last 4 characters", async () => {
    const { fetchFn, requests } = fakeApi();
    await addEngine(db, ENV, "u1", { provider: "gemini", model: "gemini-3.5-flash", key: KEY }, fetchFn);
    expect(requests[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(requests[0].headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(requests[0].body).toMatchObject({ model: "gemini-3.5-flash", reasoning_effort: "low" });

    const [row] = await db.select().from(aiEngine);
    expect(row.key).not.toContain(KEY);
    const view = await enginesView(db, ENV, "u1", new MemoryRestStore());
    expect(view.engines).toMatchObject([{ provider: "gemini", model: "gemini-3.5-flash", keyHint: "…abcd", status: "ready", chat: true }]);
    expect(JSON.stringify(view)).not.toContain(KEY);
  });

  it("refuses a key that doesn't work, in plain words, and saves nothing", async () => {
    await expect(addEngine(db, ENV, "u1", { provider: "groq", key: "bad" }, fakeApi(401).fetchFn)).rejects.toThrow("That Groq key didn't work");
    expect(await db.select().from(aiEngine)).toHaveLength(0);
  });

  it("needs a Cloudflare account ID, and calls that account", async () => {
    await expect(addEngine(db, ENV, "u1", { provider: "cloudflare", key: "t" }, fakeApi().fetchFn)).rejects.toThrow("Account ID");
    const { fetchFn, requests } = fakeApi();
    await addEngine(db, ENV, "u1", { provider: "cloudflare", key: "token-1234", extra: "my-account" }, fetchFn);
    expect(requests[0].url).toContain("/accounts/my-account/ai/v1/chat/completions");
    expect((await enginesView(db, ENV, "u1", new MemoryRestStore())).engines[0].chat).toBe(false);
  });

  it("tries the creator's engines in their order, skips switched-off ones, then Reelkar's lane", async () => {
    const { fetchFn } = fakeApi();
    await addEngine(db, ENV, "u1", { provider: "groq", key: "groq-key" }, fetchFn);
    await addEngine(db, ENV, "u1", { provider: "cerebras", key: "cerebras-key" }, fetchFn);
    await addEngine(db, ENV, "u1", { provider: "mistral", key: "mistral-key" }, fetchFn);
    const ids = (await enginesView(db, ENV, "u1", new MemoryRestStore())).engines.map((e) => e.id);

    await reorderEngines(db, "u1", [ids[2], ids[0], ids[1]]);
    await changeEngine(db, ENV, "u1", ids[1], { enabled: false }, fetchFn, new MemoryRestStore());
    const chain = (await llmForUser(db, ENV, "u1", new MemoryRestStore())) as ChainLlm;
    expect(chain.links.map((l) => l.name)).toEqual(["Mistral", "Groq", "Reelkar (Workers AI)", "Reelkar (Gemini)"]);
  });

  it("shows a resting engine, and a new key that works wakes it", async () => {
    const rests = new MemoryRestStore();
    const { fetchFn } = fakeApi();
    await addEngine(db, ENV, "u1", { provider: "groq", key: "groq-key" }, fetchFn);
    const [e] = (await enginesView(db, ENV, "u1", rests)).engines;
    const until = Date.now() + 3_600_000;
    await rests.set(`user:${e.id}`, { reason: "limit", until });
    expect((await enginesView(db, ENV, "u1", rests)).engines[0]).toMatchObject({ status: "resting", restUntil: until });

    await changeEngine(db, ENV, "u1", e.id, { key: "new-groq-key" }, fetchFn, rests);
    expect((await enginesView(db, ENV, "u1", rests)).engines[0]).toMatchObject({ status: "ready", keyHint: "…-key" });
  });

  it("shows Reelkar's lane resting only when all its engines are", async () => {
    const rests = new MemoryRestStore();
    await rests.set("lane:cloudflare", { reason: "limit", until: Date.now() + 1000 });
    expect((await enginesView(db, ENV, "u1", rests)).reelkar.status).toBe("ready");
    await rests.set("lane:gemini", { reason: "limit", until: Date.now() + 2000 });
    expect((await enginesView(db, ENV, "u1", rests)).reelkar.status).toBe("resting");
  });
});
