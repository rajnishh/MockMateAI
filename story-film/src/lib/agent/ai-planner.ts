import Anthropic from "@anthropic-ai/sdk";
import { decrypt, encrypt } from "@/lib/crypto";
import type { Db } from "@/lib/db";
import type { Env } from "@/lib/env";
import { AI_PROVIDERS, type AiChoiceView, type AiProvider, keyProblem, needsKey } from "./ai-choice";
import { ClaudeToolPlanner, type ToolPlanner } from "./claude";
import { GeminiToolPlanner } from "./gemini";
import { OpenAiToolPlanner } from "./openai-tools";
import { getAiChoice, setAiChoice } from "./store";

export interface AiChoiceInput {
  provider: string;
  model?: string;
  // The creator's key in plain text, only while saving.
  key?: string;
}

// The planner for a provider, model and key. Throws a plain message for a choice that can't work.
export function buildChoicePlanner(env: Env, c: { provider: AiProvider; model: string; key?: string }, fetchFn: typeof fetch = fetch): ToolPlanner {
  const { provider, model, key } = c;
  if (needsKey(provider) && !key) throw new Error(`Add your ${provider.name} key.`);
  if (!provider.anyModel && !provider.models.some((m) => m.id === model)) throw new Error(`Pick one of the ${provider.name} models listed.`);
  switch (provider.id) {
    case "gemini":
      return new GeminiToolPlanner(key!, model, fetchFn);
    case "claude":
      return new ClaudeToolPlanner(new Anthropic({ apiKey: key, timeout: 60_000, maxRetries: 1, fetch: fetchFn }), model);
    case "groq":
      return new OpenAiToolPlanner("https://api.groq.com/openai/v1", key, model, "groq", fetchFn);
    case "openrouter":
      return new OpenAiToolPlanner("https://openrouter.ai/api/v1", key, model, "openrouter", fetchFn);
    case "ollama":
      if (!env.OLLAMA_URL) throw new Error("Ollama isn't set up on this server.");
      return new OpenAiToolPlanner(`${env.OLLAMA_URL.replace(/\/$/, "")}/v1`, undefined, model, "ollama", fetchFn);
    default:
      throw new Error("Pick an AI from the list.");
  }
}

// Ollama is only on offer when the owner runs one; own keys only when they can be stored encrypted.
export function offeredProviders(env: Env): AiProvider[] {
  return AI_PROVIDERS.filter((p) => (p.id === "ollama" ? !!env.OLLAMA_URL : needsKey(p) ? !!env.TOKEN_ENCRYPTION_KEY : true));
}

export async function aiChoiceView(db: Db, env: Env, userId: string): Promise<AiChoiceView> {
  const c = await getAiChoice(db, userId);
  const providers = offeredProviders(env);
  const offered = providers.some((p) => p.id === c.provider);
  return {
    provider: offered ? (c.provider as AiChoiceView["provider"]) : "reelkar",
    model: offered ? c.model : null,
    keyHint: offered ? c.keyHint : null,
    providers,
    ownKeys: !!env.TOKEN_ENCRYPTION_KEY,
  };
}

// Checks the choice with one tiny message, then saves it. Leaving the key out keeps the saved one
// for the same provider, so changing only the model doesn't mean pasting the key again.
export async function saveAiChoice(db: Db, env: Env, userId: string, input: AiChoiceInput, fetchFn: typeof fetch = fetch): Promise<void> {
  const provider = offeredProviders(env).find((p) => p.id === input.provider);
  if (!provider) throw new Error("Pick an AI from the list.");
  if (provider.id === "reelkar") return setAiChoice(db, userId, { provider: "reelkar", model: null, key: null, keyHint: null });
  const model = (input.model ?? "").trim() || provider.models[0]?.id;
  if (!model) throw new Error("Pick a model.");
  const saved = await getAiChoice(db, userId);
  const newKey = input.key?.trim();
  const key = newKey || (saved.provider === provider.id && saved.key ? decrypt(saved.key, env.TOKEN_ENCRYPTION_KEY!) : undefined);
  const planner = buildChoicePlanner(env, { provider, model, key }, fetchFn);
  try {
    await planner.respond({ system: "Reply with the single word OK.", history: [], message: "Are you there?", act: async () => [] });
  } catch (err) {
    throw new Error(keyProblem(err, provider.name));
  }
  await setAiChoice(db, userId, {
    provider: provider.id,
    model,
    key: key && needsKey(provider) ? encrypt(key, env.TOKEN_ENCRYPTION_KEY!) : null,
    keyHint: key && needsKey(provider) ? `…${key.slice(-4)}` : null,
  });
}

// The creator's own planner, or undefined for Reelkar free (or a choice that's no longer offered).
export async function creatorPlanner(db: Db, env: Env, userId: string): Promise<{ planner: ToolPlanner; name: string; provider: AiProvider["id"] } | undefined> {
  const c = await getAiChoice(db, userId);
  const provider = offeredProviders(env).find((p) => p.id === c.provider);
  if (!provider || provider.id === "reelkar" || !c.model) return undefined;
  try {
    const key = c.key ? decrypt(c.key, env.TOKEN_ENCRYPTION_KEY!) : undefined;
    return { planner: buildChoicePlanner(env, { provider, model: c.model, key }), name: provider.name, provider: provider.id };
  } catch (err) {
    console.error(`[agent] ${userId}'s ${provider.name} choice can't be used:`, err);
    return undefined;
  }
}
