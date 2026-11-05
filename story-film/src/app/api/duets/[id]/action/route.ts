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
  inviteByHandle,
  phaseOf,
  reinviteDuet,
  retakePart,
  roleOf,
  setPartVoice,
  songStatusOf,
  startJoin,
} from "@/lib/duets";
import { loadEnv } from "@/lib/env";
import { notify } from "@/lib/push";
import { getUserId, unauthorized } from "@/lib/session";
import { getVoice } from "@/lib/voice/profiles";

const actionSchema = z.object({
  action: z.enum(["approve", "retake", "ask_retake", "cancel", "extend", "reinvite", "solo", "join_again", "invite_handle", "set_voice"]),
  // invite_handle: an Instagram username. set_voice: one of my own voices, or null for an AI singer.
  handle: z.string().max(31).optional(),
  voiceId: z.uuid().nullable().optional(),
});
// What only the person who started it can do.
const STARTER_ONLY = new Set(["cancel", "extend", "reinvite", "solo", "invite_handle"]);

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
  const { action, handle, voiceId } = parsed.data;
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
    else if (action === "invite_handle") row = await inviteByHandle(db, d, handle ?? "");
    else if (action === "set_voice") {
      // Only this person's own consented voice; nobody can pick the other singer's.
      if (voiceId && !(await getVoice(db, userId, voiceId))) return NextResponse.json({ error: "Voice not found" }, { status: 404 });
      row = await setPartVoice(db, d, role, userId, voiceId ?? null);
      // A joined song is made again in the new voice.
      if (row.songId && row.partAPath && row.partBPath && ["ready", "join_failed"].includes(phaseOf(row, await songStatusOf(db, row)))) row = await startJoin(db, await deps(), row);
    } else {
      // "Try again" after the song didn't come out; already paid for.
      if (phaseOf(d, await songStatusOf(db, d)) !== "join_failed") return NextResponse.json({ error: "Nothing to try again." }, { status: 400 });
      row = await startJoin(db, await deps(), d);
    }
    const me = role === "a" ? row.starterName : row.partnerName;
    const other = role === "a" ? row.partnerId : row.starterId;
    const open = { path: `/duets/${row.id}` };
    if (action === "approve") notify(db, [other], { title: `${me} approved your Jugalbandi`, body: row.approvedA && row.approvedB ? "You both said yes. It's ready to post." : "Listen and approve it too.", ...open });
    if (action === "ask_retake") notify(db, [other], { title: `${me} asked you to sing your part again`, body: `“${row.topic}”`, ...open });
    if (action === "invite_handle") notify(db, [row.invitedUserId], { title: `${row.starterName} wants to sing a Jugalbandi with you`, body: `“${row.topic}” · hear their part and sing yours`, ...open });
    return NextResponse.json(duetView(row, role, await songStatusOf(db, row), env.BETTER_AUTH_URL));
  } catch (err) {
    return duetErrorResponse(err);
  }
}
