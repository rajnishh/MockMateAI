import type { Redis } from "ioredis";
import type { ToolPlanner, ToolPlannerInput } from "@/lib/agent/claude";
import type { FilmScript, LlmProvider, ScriptRequest } from "@/lib/providers/types";

// Auto-switch: every AI task tries a list of engines in order (the creator's own, then Reelkar's
// lane). An engine that runs out of free use, or whose key stops working, rests until it should
// work again, so later tasks go straight to the next engine instead of waiting on it to fail.

export type RestReason = "limit" | "key";

export interface Rest {
  reason: RestReason;
  // Epoch milliseconds.
  until: number;
}

// Where rests are kept, shared by the web app and the worker.
export interface RestStore {
  get(id: string): Promise<Rest | null>;
  set(id: string, rest: Rest): Promise<void>;
  clear(id: string): Promise<void>;
}

// Takes a getter so building a chain never opens a Redis connection by itself.
export class RedisRestStore implements RestStore {
  constructor(private readonly redis: () => Redis) {}

  async get(id: string): Promise<Rest | null> {
    const raw = await this.redis().get(`ai:rest:${id}`).catch(() => null);
    return raw ? (JSON.parse(raw) as Rest) : null;
  }

  async set(id: string, rest: Rest): Promise<void> {
    const ttl = Math.max(1, Math.ceil((rest.until - Date.now()) / 1000));
    await this.redis().set(`ai:rest:${id}`, JSON.stringify(rest), "EX", ttl).catch(() => undefined);
  }

  async clear(id: string): Promise<void> {
    await this.redis().del(`ai:rest:${id}`).catch(() => undefined);
  }
}

export class MemoryRestStore implements RestStore {
  readonly rests = new Map<string, Rest>();

  async get(id: string) {
    const r = this.rests.get(id);
    return r && r.until > Date.now() ? r : null;
  }

  async set(id: string, rest: Rest) {
    this.rests.set(id, rest);
  }

  async clear(id: string) {
    this.rests.delete(id);
  }
}

const MINUTE = 60_000;

// Daily free allowances (Workers AI, Gemini, Groq) reset at midnight UTC.
export function nextUtcMidnight(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

function httpStatus(err: unknown): number | undefined {
  const status = (err as { status?: number } | undefined)?.status;
  if (typeof status === "number") return status;
  const m = (err instanceof Error ? err.message : "").match(/\b(4\d\d|5\d\d)\b/);
  return m ? Number(m[1]) : undefined;
}

// How long an engine should rest after this failure; null means just try the next one this time.
export function restFor(err: unknown, now = Date.now()): Rest | null {
  const status = httpStatus(err);
  const text = err instanceof Error ? err.message : String(err);
  if (status === 429 || status === 402) {
    // A daily allowance used up rests until it resets; a per-minute limit only briefly.
    const daily = /daily|per day|allocation|quota|credits|exhausted/i.test(text) || status === 402;
    return { reason: "limit", until: daily ? nextUtcMidnight(now) : now + 2 * MINUTE };
  }
  if (status === 401 || status === 403) return { reason: "key", until: now + 60 * MINUTE };
  return null;
}

// One engine in a chain. `id` names its rest: "user:<engine id>" or "lane:<name>".
export interface Link<T> {
  id: string;
  name: string;
  engine: T;
}

async function tryInOrder<T, R>(links: Link<T>[], rests: RestStore, run: (engine: T) => Promise<R>, canRetry: () => boolean = () => true): Promise<R> {
  if (!links.length) throw new Error("No AI engine is set up");
  let lastErr: unknown;
  const awake: Link<T>[] = [];
  for (const link of links) if (!(await rests.get(link.id))) awake.push(link);
  // If every engine is resting, try them all anyway rather than refuse outright.
  for (const link of awake.length ? awake : links) {
    try {
      return await run(link.engine);
    } catch (err) {
      lastErr = err;
      const rest = restFor(err);
      if (rest) await rests.set(link.id, rest);
      console.warn(`[ai] ${link.name} failed${rest ? ` (resting: ${rest.reason})` : ""}, trying the next engine: ${String((err as Error)?.message ?? err).slice(0, 200)}`);
      if (!canRetry()) break;
    }
  }
  throw lastErr;
}

// Text and JSON tasks: lyrics, safety checks, ideas, captions, reel scripts.
export class ChainLlm implements LlmProvider {
  readonly modelId: string;

  constructor(
    readonly links: Link<LlmProvider>[],
    private readonly rests: RestStore,
  ) {
    // The license check covers the first engine; every engine in the catalog is allowlisted.
    this.modelId = links[0]?.engine.modelId ?? "none";
  }

  writeScript(input: ScriptRequest): Promise<FilmScript> {
    return tryInOrder(this.links, this.rests, (llm) => llm.writeScript(input));
  }

  completeJson(prompt: string): Promise<unknown> {
    return tryInOrder(this.links, this.rests, (llm) => llm.completeJson(prompt));
  }
}

// Ask Reelkar's chat. An engine that fails before doing anything hands over to the next one; once
// an action has run (a reel started), it isn't planned again by another engine.
export class ChainPlanner implements ToolPlanner {
  readonly modelId: string;

  constructor(
    readonly links: Link<ToolPlanner>[],
    private readonly rests: RestStore,
  ) {
    this.modelId = links[0]?.engine.modelId ?? "none";
  }

  respond(input: ToolPlannerInput): Promise<string> {
    let acted = false;
    const act: ToolPlannerInput["act"] = (name, args) => {
      acted = true;
      return input.act(name, args);
    };
    return tryInOrder(this.links, this.rests, (planner) => planner.respond({ ...input, act }), () => !acted);
  }
}
