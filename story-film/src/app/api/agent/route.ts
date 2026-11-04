import { NextResponse } from "next/server";
import { z } from "zod";
import { handleMessage } from "@/lib/agent/agent";
import { creatorPlanner } from "@/lib/agent/ai-planner";
import { agentDeps, toTurn, turnSchema } from "@/lib/agent/deps";
import { getPostingMode, historyView } from "@/lib/agent/store";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { getUserId, unauthorized } from "@/lib/session";
import { freeReelsLeft } from "@/lib/start-film";

// Free plan: Ask Reelkar answers this many messages a day (it runs on our low-cost models).
const DAILY_MESSAGES = 40;
// With the creator's own AI key, their provider's limits apply; this only stops runaway use.
const DAILY_MESSAGES_OWN_KEY = 300;

const messageSchema = turnSchema.extend({ text: z.string().trim().min(1).max(1000) });

// The conversation, the posting mode and free reels left.
export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const db = getDb();
  const [messages, postingMode, freeLeft] = await Promise.all([historyView(db, userId), getPostingMode(db, userId), freeReelsLeft(userId).catch(() => null)]);
  return NextResponse.json({ messages, postingMode, freeLeft });
}

// A message to the agent; the reply and whatever it did come back in the updated conversation.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = messageSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const deps = agentDeps();
  const own = await creatorPlanner(deps.db, loadEnv(), userId);
  const ownKey = !!own && own.provider !== "ollama";
  const limit = ownKey ? DAILY_MESSAGES_OWN_KEY : DAILY_MESSAGES;
  if (!(await allow(getRedis(), `ratelimit:agent:${ownKey ? "own:" : ""}${userId}`, limit, 24 * 3600))) {
    return NextResponse.json({ error: `Ask Reelkar answers ${limit} messages a day${ownKey ? "" : " on the free plan"}. Try again tomorrow, or use the Create screen.` }, { status: 429 });
  }
  if (own) Object.assign(deps, { planner: own.planner, ownAi: own.name });
  await handleMessage(deps, toTurn(userId, parsed.data), parsed.data.text);
  return NextResponse.json({ messages: await historyView(deps.db, userId) });
}
