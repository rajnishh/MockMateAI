// The AI engines a creator can connect, shared by the server and the settings screens. Every AI task
// (chat, lyrics, song checks, ideas, captions, reel scripts) tries the creator's engines in order,
// then "reelkar", Reelkar's own lane on the owner's keys. The others use the creator's own key,
// except Ollama, which runs on Reelkar's server when the owner sets it up (OLLAMA_URL).

export type AiProviderId = "reelkar" | "gemini" | "groq" | "cerebras" | "mistral" | "cloudflare" | "openrouter" | "claude" | "ollama";

export interface AiModelOption {
  id: string;
  label: string;
}

export interface AiProvider {
  id: AiProviderId;
  name: string;
  // What it costs the creator, in a few words.
  price: string;
  // Where the creator gets a key; absent when no key is needed.
  keyUrl?: string;
  models: AiModelOption[];
  // Whether the creator may type any model id the provider offers.
  anyModel: boolean;
  // Whether it can run Ask Reelkar's chat (calling actions as tools); all of them do text tasks.
  chat: boolean;
  // A second value the provider needs besides the key, such as Cloudflare's account id.
  extra?: { label: string; placeholder: string };
}

export const AI_PROVIDERS: AiProvider[] = [
  { id: "reelkar", name: "Reelkar free", price: "Free, no key needed", models: [], anyModel: false, chat: true },
  {
    id: "gemini",
    name: "Google Gemini",
    price: "Free key, within Google's daily limits",
    keyUrl: "https://aistudio.google.com/apikey",
    models: [
      { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash · fast, free" },
      { id: "gemini-flash-latest", label: "Newest Gemini Flash · free" },
      { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite · fastest, highest free limit" },
      { id: "gemini-pro-latest", label: "Newest Gemini Pro · smarter, lower free limit" },
    ],
    // Google renames and retires models often, so any current model id is accepted.
    anyModel: true,
    chat: true,
  },
  {
    id: "groq",
    name: "Groq",
    price: "Free key, within Groq's limits",
    keyUrl: "https://console.groq.com/keys",
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B · free" },
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B · free, smarter" },
      { id: "qwen/qwen3-32b", label: "Qwen3 32B · free" },
    ],
    anyModel: true,
    chat: true,
  },
  {
    id: "cerebras",
    name: "Cerebras",
    price: "Free key, very fast, within Cerebras's daily limits",
    keyUrl: "https://cloud.cerebras.ai/platform",
    models: [
      { id: "llama-3.3-70b", label: "Llama 3.3 70B · free" },
      { id: "gpt-oss-120b", label: "GPT-OSS 120B · free, smarter" },
      { id: "qwen-3-32b", label: "Qwen3 32B · free" },
    ],
    anyModel: true,
    chat: true,
  },
  {
    id: "mistral",
    name: "Mistral",
    price: "Free key on Mistral's Experiment plan",
    keyUrl: "https://console.mistral.ai/api-keys",
    models: [
      { id: "mistral-small-latest", label: "Mistral Small · free" },
      { id: "mistral-large-latest", label: "Mistral Large · smarter, free with limits" },
    ],
    anyModel: true,
    chat: true,
  },
  {
    id: "cloudflare",
    name: "Cloudflare Workers AI",
    price: "Your own free Cloudflare account, 10,000 neurons a day",
    keyUrl: "https://dash.cloudflare.com/profile/api-tokens",
    models: [{ id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", label: "Llama 3.3 70B · free" }],
    anyModel: true,
    chat: false,
    extra: { label: "Account ID", placeholder: "From the Workers AI page of your dashboard" },
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    price: "One key for hundreds of models; \":free\" ones cost nothing",
    keyUrl: "https://openrouter.ai/keys",
    models: [
      { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B · free" },
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash · cheap" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro · smarter, paid" },
    ],
    anyModel: true,
    chat: true,
  },
  {
    id: "claude",
    name: "Anthropic Claude",
    price: "Paid, about ₹0.09 a message with Haiku",
    keyUrl: "https://console.anthropic.com/settings/keys",
    models: [
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 · fast, cheap" },
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 · smarter" },
    ],
    anyModel: false,
    chat: true,
  },
  {
    id: "ollama",
    name: "Ollama (on Reelkar's server)",
    price: "Free, runs on the server's own computer",
    models: [
      { id: "gemma3:12b", label: "Gemma 3 12B · good Hinglish" },
      { id: "qwen3:8b", label: "Qwen3 8B" },
      { id: "llama3.1:8b", label: "Llama 3.1 8B" },
    ],
    anyModel: true,
    chat: true,
  },
];

export function findProvider(id: string): AiProvider | undefined {
  return AI_PROVIDERS.find((p) => p.id === id);
}

export const needsKey = (p: AiProvider) => p.id !== "reelkar" && p.id !== "ollama";

export const MAX_ENGINES = 8;

// How an engine is doing right now: "resting" has used up its free allowance until `restUntil`;
// "key" means the key stopped working (wrong, revoked or out of credit).
export type EngineStatus = "ready" | "resting" | "key";

// One of the creator's engines as the settings screens see it. The key never comes back.
export interface EngineView {
  id: string;
  provider: AiProviderId;
  name: string;
  model: string;
  // e.g. "…a1b2"; null when no key is needed.
  keyHint: string | null;
  enabled: boolean;
  chat: boolean;
  status: EngineStatus;
  // Epoch milliseconds, while resting.
  restUntil: number | null;
}

export interface EnginesView {
  // In the order they're tried; Reelkar's own lane always comes after them.
  engines: EngineView[];
  // What can be added. Reelkar's lane isn't in it.
  providers: AiProvider[];
  // False when the server can't store keys safely (no TOKEN_ENCRYPTION_KEY).
  ownKeys: boolean;
  // Reelkar's lane: "resting" only when every one of its engines is resting.
  reelkar: { status: EngineStatus; restUntil: number | null };
}

// Why the creator's AI didn't answer, in plain words.
export function keyProblem(err: unknown, name: string): string {
  const status = (err as { status?: number } | undefined)?.status ?? Number((err instanceof Error ? err.message : "").match(/\b(4\d\d|5\d\d)\b/)?.[1]);
  if (status === 401 || status === 403) return `That ${name} key didn't work. Check it was copied in full.`;
  if (status === 429) return `This ${name} key has hit its limit for now. Try again later.`;
  if (status === 404) return `That model isn't available on ${name} with this key.`;
  if (status === 400) return `${name} turned the request down. Try a different model.`;
  if (err instanceof Error && /isn't set up|Add your|Pick /.test(err.message)) return err.message;
  return `Couldn't reach ${name}. Try again in a minute.`;
}
