import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { duetByToken } from "@/lib/duets";
import { loadEnv } from "@/lib/env";
import { clientIp } from "@/lib/listen-http";
import { fileReport, ownerAlert, reportInputSchema } from "@/lib/moderation";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { getUserId } from "@/lib/session";

// The Report link on a public Jugalbandi invite, and Report on a duet in the app. No sign-in needed;
// a person reviews each report within 24 hours, and enough reports hide the invite until then
// (src/lib/moderation.ts). A signed-in reporter no longer sees an invite they reported.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ip = clientIp(req);
  if (!(await allow(getRedis(), `ratelimit:duet-report:${ip}`, 10, 3600))) {
    return NextResponse.json({ error: "You've sent a lot of reports. Try again in an hour." }, { status: 429 });
  }
  const parsed = reportInputSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const db = getDb();
  // Reports reach a duet that's already hidden too (duetByToken leaves those out for everything else).
  const d = await duetByToken(db, (await params).token, { hidden: true });
  if (!d) return NextResponse.json({ error: "We couldn't find this invite." }, { status: 404 });
  const userId = await getUserId().catch(() => undefined);
  await fileReport(db, "duet", d.id, parsed.data, { userId, ip }, ownerAlert(loadEnv()));
  return NextResponse.json({ ok: true }, { status: 201 });
}
