import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { publicGift } from "@/lib/gifts";
import { clientIp } from "@/lib/listen-http";
import { fileReport, ownerAlert, reportInputSchema } from "@/lib/moderation";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { getUserId } from "@/lib/session";

// The Report link on every public gift page, and Report on a song sent back in the app's Inbox. No
// sign-in needed; a person reviews each report within 24 hours, and enough reports hide the gift
// until then (src/lib/moderation.ts). A signed-in reporter no longer sees it in their Inbox.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = clientIp(req);
  if (!(await allow(getRedis(), `ratelimit:gift-report:${ip}`, 10, 3600))) {
    return NextResponse.json({ error: "You've sent a lot of reports. Try again in an hour." }, { status: 429 });
  }
  const parsed = reportInputSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const db = getDb();
  const found = await publicGift(db, token);
  if (!found) return NextResponse.json({ error: "We couldn't find this gift." }, { status: 404 });
  const userId = await getUserId().catch(() => undefined);
  await fileReport(db, "gift", found.gift.id, parsed.data, { userId, ip }, ownerAlert(loadEnv()));
  return NextResponse.json({ ok: true }, { status: 201 });
}
