import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { duetByToken, duetErrorResponse, duetView, joinDuet, joinDuetSchema } from "@/lib/duets";
import { loadEnv } from "@/lib/env";
import { notify } from "@/lib/push";
import { getUserId, unauthorized } from "@/lib/session";

// B opens the invite and joins: their name, Instagram username for the Collab post, and whether
// they offer to pay half.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const db = getDb();
  const d = await duetByToken(db, (await params).token);
  if (!d) return NextResponse.json({ error: "We couldn't find this invite." }, { status: 404 });
  const parsed = joinDuetSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  try {
    const row = await joinDuet(db, d, userId, parsed.data);
    notify(db, [row.starterId], { title: `${row.partnerName} joined your Jugalbandi`, body: `“${row.topic}”${row.paidB ? ` · they're paying half` : ""}`, path: `/duets/${row.id}` });
    return NextResponse.json(duetView(row, "b", null, loadEnv().BETTER_AUTH_URL));
  } catch (err) {
    return duetErrorResponse(err);
  }
}
