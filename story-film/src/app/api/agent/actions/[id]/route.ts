import { NextResponse } from "next/server";
import { z } from "zod";
import { decide } from "@/lib/agent/agent";
import { agentDeps, toTurn, turnSchema } from "@/lib/agent/deps";
import { historyView } from "@/lib/agent/store";
import { getUserId, unauthorized } from "@/lib/session";

const schema = turnSchema.extend({ approve: z.boolean() });

// Approve or cancel something the agent proposed (posting mode "ask").
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "approve must be true or false" }, { status: 400 });
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const deps = agentDeps();
  await decide(deps, toTurn(userId, parsed.data), id.data, parsed.data.approve);
  return NextResponse.json({ messages: await historyView(deps.db, userId) });
}
