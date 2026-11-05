import Anthropic from "@anthropic-ai/sdk";
import { and, asc, eq } from "drizzle-orm";
import { AI_PROVIDERS, type AiProvider, type EngineStatus, type EnginesView, type EngineView, keyProblem, MAX_ENGINES, needsKey } from "@/lib/agent/ai-choice";
import { ClaudeToolPlanner, type ToolPlanner } from "@/lib/agent/claude";
import { GeminiToolPlanner } from "@/lib/agent/gemini";
import { OpenAiToolPlanner } from "@/lib/agent/openai-tools";
import { decrypt, encrypt } from "@/lib/crypto";
import type { Db } from "@/lib/db";
import { aiEngine } from "@/lib/db/app-schema";
import type { Env } from "@/lib/env";
import { aiRests, geminiLlm, ollamaLlm, reelkarLane } from "@/lib/providers";
import { cloudflareAiBase } from "@/lib/providers/cloudflare";
import { OpenAiCompatibleLlm } from "@/lib/providers/llm";
import type { LlmProvider } from "@/lib/providers/types";
import { ChainLlm, ChainPlanner, type Link, type RestStore } from "./chain";

type EngineRow = typeof aiEngine.$inferSelect;

// An engine with its key decrypted, only while it's being used.
interface Engine {
  provider: AiProvider;
  model: string;
  key?: string;
  extra?: string;
}

// OpenAI-compatible text endpoints. Gemini, Cloudflare and Ollama are built separately.
const TEXT_BASES: Partial<Record<AiProvider["id"], string>> = {
  groq: "https://api.groq.com/openai/v1",
  cerebras: "https://api.cerebras.ai/v1",
  mistral: "https://api.mistral.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  claude: "https://api.anthropic.com/v1",
};

// The engine for text and JSON tasks. Throws a plain message for one that can't work.
export function textEngine(env: Env, e: Engine, fetchFn: typeof fetch = fetch): LlmProvider {
  const { provider, model, key } = e;
  if (needsKey(provider) && !key) throw new Error(`Add your ${provider.name} key.`);
  switch (provider.id) {
    case "gemini":
      return geminiLlm(key!, model, fetchFn);
    case "cloudflare":
      if (!e.extra) throw new Error("Add your Cloudflare account ID.");
      return new OpenAiCompatibleLlm(`${cloudflareAiBase(e.extra)}/v1`, key!, model, { licenseId: "cloudflare-workers-ai", jsonMode: true }, fetchFn);
    case "ollama":
      if (!env.OLLAMA_URL) throw new Error("Ollama isn't set up on this server.");
      return ollamaLlm(env.OLLAMA_URL, model, fetchFn);
    case "claude":
      // Claude's OpenAI-compatible endpoint ignores JSON mode; the prompts ask for JSON anyway.
      return new OpenAiCompatibleLlm(TEXT_BASES.claude!, key!, model, { licenseId: model, jsonMode: false }, fetchFn);
    default: {
      const base = TEXT_BASES[provider.id];
      if (!base) throw new Error("Pick an AI from the list.");
      return new OpenAiCompatibleLlm(base, key!, model, { licenseId: provider.id, jsonMode: true }, fetchFn);
    }
  }
}

// The engine for Ask Reelkar's chat, or undefined for one that can't call tools (Cloudflare).
export function chatEngine(env: Env, e: Engine, fetchFn: typeof fetch = fetch): ToolPlanner | undefined {
  const { provider, model, key } = e;
  if (!provider.chat) return undefined;
  if (needsKey(provider) && !key) throw new Error(`Add your ${provider.name} key.`);
  switch (provider.id) {
    case "gemini":
      return new GeminiToolPlanner(key!, model, fetchFn);
    case "claude":
      return new ClaudeToolPlanner(new Anthropic({ apiKey: key, timeout: 60_000, maxRetries: 1, fetch: fetchFn }), model);
    case "ollama":
      if (!env.OLLAMA_URL) throw new Error("Ollama isn't set up on this server.");
      return new OpenAiToolPlanner(`${env.OLLAMA_URL.replace(/\/$/, "")}/v1`, undefined, model, "ollama", fetchFn);
    default: {
      const base = TEXT_BASES[provider.id];
      return base ? new OpenAiToolPlanner(base, key, model, provider.id, fetchFn) : undefined;
    }
  }
}

// Ollama is only on offer when the owner runs one; own keys only when they can be stored encrypted.
export function offeredProviders(env: Env): AiProvider[] {
  return AI_PROVIDERS.filter((p) => p.id !== "reelkar" && (p.id === "ollama" ? !!env.OLLAMA_URL : !!env.TOKEN_ENCRYPTION_KEY));
}

function unpack(env: Env, row: EngineRow): Engine | undefined {
  const provider = offeredProviders(env).find((p) => p.id === row.provider);
  if (!provider) return undefined;
  const open = (v: string | null) => (v && env.TOKEN_ENCRYPTION_KEY ? decrypt(v, env.TOKEN_ENCRYPTION_KEY) : undefined);
  return { provider, model: row.model, key: open(row.key), extra: open(row.extra) };
}

async function engineRows(db: Db, userId: string): Promise<EngineRow[]> {
  return db.select().from(aiEngine).where(eq(aiEngine.userId, userId)).orderBy(asc(aiEngine.position), asc(aiEngine.createdAt));
}

const linkId = (row: EngineRow) => `user:${row.id}`;

// The creator's working engines, in order, as chain links.
async function userLinks<T>(db: Db, env: Env, userId: string, build: (e: Engine) => T | undefined): Promise<Link<T>[]> {
  const links: Link<T>[] = [];
  for (const row of await engineRows(db, userId)) {
    if (!row.enabled) continue;
    try {
      const e = unpack(env, row);
      const engine = e && build(e);
      if (e && engine) links.push({ id: linkId(row), name: e.provider.name, engine });
    } catch (err) {
      console.error(`[ai] ${userId}'s ${row.provider} engine can't be used:`, (err as Error).message);
    }
  }
  return links;
}

// Every AI text task for this creator: their engines in order, then Reelkar's lane.
export async function llmForUser(db: Db, env: Env, userId: string, rests: RestStore = aiRests): Promise<LlmProvider> {
  const own = await userLinks(db, env, userId, (e) => textEngine(env, e));
  return new ChainLlm([...own, ...reelkarLane(env)], rests);
}

// Ask Reelkar's chat on the creator's own engines that can call tools, or undefined when they have
// none (Reelkar's free planner answers). `name` is the first one's, for the note if they all fail.
export async function plannerForUser(db: Db, env: Env, userId: string, rests: RestStore = aiRests): Promise<{ planner: ToolPlanner; name: string; ownKey: boolean } | undefined> {
  // Ollama runs on Reelkar's server, so it keeps the free plan's daily message limit.
  let ownKey = false;
  const links = await userLinks(db, env, userId, (e) => {
    const planner = chatEngine(env, e);
    if (planner && e.provider.id !== "ollama") ownKey = true;
    return planner;
  });
  if (!links.length) return undefined;
  return { planner: new ChainPlanner(links, rests), name: links[0].name, ownKey };
}

async function statusOf(rests: RestStore, id: string): Promise<{ status: EngineStatus; restUntil: number | null }> {
  const rest = await rests.get(id);
  if (!rest) return { status: "ready", restUntil: null };
  return { status: rest.reason === "key" ? "key" : "resting", restUntil: rest.until };
}

export async function enginesView(db: Db, env: Env, userId: string, rests: RestStore = aiRests): Promise<EnginesView> {
  const providers = offeredProviders(env);
  const engines: EngineView[] = [];
  for (const row of await engineRows(db, userId)) {
    const provider = providers.find((p) => p.id === row.provider);
    if (!provider) continue;
    engines.push({ id: row.id, provider: provider.id, name: provider.name, model: row.model, keyHint: row.keyHint, enabled: row.enabled, chat: provider.chat, ...(await statusOf(rests, linkId(row))) });
  }
  // Reelkar's lane rests only when all of its engines do; then it's back at the earliest one.
  let lane: { status: EngineStatus; restUntil: number | null } = { status: "ready", restUntil: null };
  try {
    const states = await Promise.all(reelkarLane(env).map((l) => statusOf(rests, l.id)));
    if (states.length && states.every((s) => s.status !== "ready")) lane = { status: "resting", restUntil: Math.min(...states.map((s) => s.restUntil ?? Infinity)) };
  } catch {
    // No lane configured; nothing to report.
  }
  return { engines, providers, ownKeys: !!env.TOKEN_ENCRYPTION_KEY, reelkar: lane };
}

export interface EngineInput {
  provider: string;
  model?: string;
  // The creator's key and extra value in plain text, only while saving.
  key?: string;
  extra?: string;
}

// One tiny request, so a wrong key, account or model shows up on the settings screen.
async function check(env: Env, e: Engine, fetchFn: typeof fetch): Promise<void> {
  try {
    await textEngine(env, e, fetchFn).completeJson('Reply with this JSON only: {"ok": true}');
  } catch (err) {
    throw new Error(keyProblem(err, e.provider.name));
  }
}

function pickModel(provider: AiProvider, model: string | undefined): string {
  const m = (model ?? "").trim() || provider.models[0]?.id;
  if (!m) throw new Error("Pick a model.");
  if (!provider.anyModel && !provider.models.some((x) => x.id === m)) throw new Error(`Pick one of the ${provider.name} models listed.`);
  return m;
}

const seal = (env: Env, v: string | undefined) => (v ? encrypt(v, env.TOKEN_ENCRYPTION_KEY!) : null);

// Checks the engine, then adds it at the end of the creator's list.
export async function addEngine(db: Db, env: Env, userId: string, input: EngineInput, fetchFn: typeof fetch = fetch): Promise<void> {
  const provider = offeredProviders(env).find((p) => p.id === input.provider);
  if (!provider) throw new Error("Pick an AI from the list.");
  const rows = await engineRows(db, userId);
  if (rows.length >= MAX_ENGINES) throw new Error(`You can connect up to ${MAX_ENGINES} engines.`);
  const key = input.key?.trim() || undefined;
  const extra = input.extra?.trim() || undefined;
  const e: Engine = { provider, model: pickModel(provider, input.model), key, extra };
  if (needsKey(provider) && !key) throw new Error(`Add your ${provider.name} key.`);
  if (provider.extra && !extra) throw new Error(`Add your ${provider.extra.label}.`);
  await check(env, e, fetchFn);
  await db.insert(aiEngine).values({
    userId,
    provider: provider.id,
    model: e.model,
    key: needsKey(provider) ? seal(env, key) : null,
    keyHint: key && needsKey(provider) ? `…${key.slice(-4)}` : null,
    extra: seal(env, extra),
    position: Math.max(-1, ...rows.map((r) => r.position)) + 1,
  });
}

export interface EngineChange {
  model?: string;
  key?: string;
  extra?: string;
  enabled?: boolean;
}

// A new model, key or account is checked before it's saved; switching an engine on or off isn't.
export async function changeEngine(db: Db, env: Env, userId: string, id: string, change: EngineChange, fetchFn: typeof fetch = fetch, rests: RestStore = aiRests): Promise<void> {
  const [row] = await db.select().from(aiEngine).where(and(eq(aiEngine.id, id), eq(aiEngine.userId, userId)));
  const saved = row && unpack(env, row);
  if (!row || !saved) throw new Error("That engine isn't connected.");
  const key = change.key?.trim() || saved.key;
  const extra = change.extra?.trim() || saved.extra;
  const model = change.model !== undefined ? pickModel(saved.provider, change.model) : saved.model;
  const set: Partial<typeof aiEngine.$inferInsert> = {};
  if (change.enabled !== undefined) set.enabled = change.enabled;
  if (model !== saved.model || key !== saved.key || extra !== saved.extra) {
    await check(env, { provider: saved.provider, model, key, extra }, fetchFn);
    Object.assign(set, { model, extra: seal(env, extra) });
    if (needsKey(saved.provider) && key !== saved.key) Object.assign(set, { key: seal(env, key), keyHint: key ? `…${key.slice(-4)}` : null });
    // It works now, so it shouldn't stay resting from an old failure.
    await rests.clear(linkId(row));
  }
  if (Object.keys(set).length) await db.update(aiEngine).set(set).where(eq(aiEngine.id, id));
}

export async function removeEngine(db: Db, userId: string, id: string): Promise<void> {
  await db.delete(aiEngine).where(and(eq(aiEngine.id, id), eq(aiEngine.userId, userId)));
}

// The creator's engines in a new order; ids that aren't theirs are ignored.
export async function reorderEngines(db: Db, userId: string, ids: string[]): Promise<void> {
  const mine = new Set((await engineRows(db, userId)).map((r) => r.id));
  const order = ids.filter((id) => mine.has(id));
  await db.transaction(async (tx) => {
    for (const [position, id] of order.entries()) await tx.update(aiEngine).set({ position }).where(eq(aiEngine.id, id));
  });
}
