import { NextResponse } from "next/server";
import { z } from "zod";
import { isAction } from "@/lib/agent/actions";
import { runAction } from "@/lib/agent/agent";
import { agentDeps, toTurn, turnSchema } from "@/lib/agent/deps";
import { historyView } from "@/lib/agent/store";
import { getUserId, unauthorized } from "@/lib/session";

const schema = turnSchema.extend({ name: z.string(), input: z.unknown(), label: z.string().trim().max(200).optional() });

// Runs one action directly, without the AI: the buttons on the agent's cards ("Make this").
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isAction(parsed.data.name)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  const deps = agentDeps();
  await runAction(deps, toTurn(userId, parsed.data), parsed.data.name, parsed.data.input, parsed.data.label);
  return NextResponse.json({ messages: await historyView(deps.db, userId) });
}
