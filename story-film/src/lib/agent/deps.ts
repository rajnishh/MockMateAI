import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { rerenderEdit } from "@/lib/edit/rerender";
import { type Env, loadEnv } from "@/lib/env";
import { buildLlm } from "@/lib/providers";
import { publicVideoUrl } from "@/lib/public-video";
import { enqueuePost, getPublishQueue } from "@/lib/queue/publish";
import { freeReelsLeft, startFilm } from "@/lib/start-film";
import type { AgentDeps, Turn } from "./agent";
import { ClaudeToolPlanner } from "./claude";
import { validTimeZone } from "./time";

export function agentDeps(): AgentDeps {
  const env = loadEnv();
  return {
    db: getDb(),
    llm: buildLlm(env),
    startFilm,
    rerenderEdit,
    enqueuePost: (post) => enqueuePost(getPublishQueue(), post),
    planner: claudePlanner(env),
    freeReelsLeft: (userId) => freeReelsLeft(userId),
    reelLinks: env.TOKEN_ENCRYPTION_KEY
      ? (id) => ({
          video: publicVideoUrl(env.BETTER_AUTH_URL, env.TOKEN_ENCRYPTION_KEY!, id),
          app: `reelkar://reel/${id}`,
          web: `${env.BETTER_AUTH_URL}/create?film=${id}`,
        })
      : undefined,
  };
}

// What the apps send with each request: the device's time zone and the creator's saved preferences.
export const turnSchema = z.object({
  timeZone: z.string().max(64).optional(),
  language: z.string().trim().max(10).optional(),
  topic: z.string().trim().max(100).optional(),
  brand: z
    .object({
      accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      background: z.enum(["light", "dark"]).optional(),
      handle: z.string().trim().max(30).optional(),
    })
    .optional(),
});

export function toTurn(userId: string, t: z.infer<typeof turnSchema>): Turn {
  return { userId, timeZone: validTimeZone(t.timeZone), language: t.language, topic: t.topic, brand: t.brand };
}

// Claude only when switched on and a key is set; otherwise the free planner answers.
let planner: ClaudeToolPlanner | undefined;
let warned = false;
function claudePlanner(env: Env): ClaudeToolPlanner | undefined {
  if (env.ASK_REELKAR_AI !== "claude") return undefined;
  if (!env.ANTHROPIC_API_KEY) {
    if (!warned) console.warn("ASK_REELKAR_AI=claude but ANTHROPIC_API_KEY is not set; Ask Reelkar uses the free model");
    warned = true;
    return undefined;
  }
  planner ??= new ClaudeToolPlanner(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }), env.ASK_REELKAR_CLAUDE_MODEL);
  return planner;
}
