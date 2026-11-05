import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { duetByToken, saveDuetReport } from "@/lib/duets";
import { reportSchema } from "@/lib/gifts";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";

// The Report link on a public Jugalbandi invite. No sign-in; a person reviews each report.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (!(await allow(getRedis(), `ratelimit:duet-report:${ip}`, 10, 3600))) {
    return NextResponse.json({ error: "You've sent a lot of reports. Try again in an hour." }, { status: 429 });
  }
  const parsed = reportSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const db = getDb();
  const d = await duetByToken(db, (await params).token);
  if (!d) return NextResponse.json({ error: "We couldn't find this invite." }, { status: 404 });
  await saveDuetReport(db, d.id, parsed.data);
  return NextResponse.json({ ok: true }, { status: 201 });
}
