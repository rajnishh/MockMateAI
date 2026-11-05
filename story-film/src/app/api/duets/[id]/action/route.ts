import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { duetMakeDeps } from "@/lib/duet-make";
import {
  approveDuet,
  askRetake,
  cancelDuet,
  type Duet,
  duetErrorResponse,
  duetView,
  extendDuet,
  finishSolo,
  getDuet,
  phaseOf,
  reinviteDuet,
  retakePart,
  roleOf,
  songStatusOf,
  startJoin,
} from "@/lib/duets";
import { loadEnv } from "@/lib/env";
import { getUserId, unauthorized } from "@/lib/session";

const actionSchema = z.object({ action: z.enum(["approve", "retake", "ask_retake", "cancel", "extend", "reinvite", "solo", "join_again"]) });
// What only the person who started it can do.
const STARTER_ONLY = new Set(["cancel", "extend", "reinvite", "solo"]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const env = loadEnv();
  const db = getDb();
  const d = await getDuet(db, (await params).id);
  const role = d ? roleOf(d, userId) : null;
  if (!d || !role) return NextResponse.json({ error: "Jugalbandi not found" }, { status: 404 });
  const parsed = actionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  const { action } = parsed.data;
  if (STARTER_ONLY.has(action) && role !== "a") return NextResponse.json({ error: "Only the person who started it can do that." }, { status: 403 });
  const deps = () => duetMakeDeps(db, env, d.starterId, d.genre, d.language);
  try {
    let row: Duet;
    if (action === "approve") row = await approveDuet(db, d, role);
    else if (action === "retake") row = await retakePart(db, d, role, userId);
    else if (action === "ask_retake") row = await askRetake(db, d, role);
    else if (action === "cancel") row = await cancelDuet(db, d);
    else if (action === "extend") row = await extendDuet(db, d);
    else if (action === "reinvite") row = await reinviteDuet(db, d);
    else if (action === "solo") row = await finishSolo(db, await deps(), d);
    else {
      // "Try again" after the song didn't come out; already paid for.
      if (phaseOf(d, await songStatusOf(db, d)) !== "join_failed") return NextResponse.json({ error: "Nothing to try again." }, { status: 400 });
      row = await startJoin(db, await deps(), d);
    }
    return NextResponse.json(duetView(row, role, await songStatusOf(db, row), env.BETTER_AUTH_URL));
  } catch (err) {
    return duetErrorResponse(err);
  }
}
