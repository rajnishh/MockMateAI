import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { publicGift, reportSchema, saveReport } from "@/lib/gifts";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";

// The Report link on every public gift page. No sign-in; a person reviews each report.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (!(await allow(getRedis(), `ratelimit:gift-report:${ip}`, 10, 3600))) {
    return NextResponse.json({ error: "You've sent a lot of reports. Try again in an hour." }, { status: 429 });
  }
  const parsed = reportSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const db = getDb();
  const found = await publicGift(db, token);
  if (!found) return NextResponse.json({ error: "We couldn't find this gift." }, { status: 404 });
  await saveReport(db, found.gift.id, parsed.data);
  return NextResponse.json({ ok: true }, { status: 201 });
}
