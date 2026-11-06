import { NextResponse } from "next/server";
import { z } from "zod";
import { EARN_RATE_BP } from "@/lib/billing/catalog";
import { earningsBySubject, earningTotals } from "@/lib/billing/earnings";
import { getDb } from "@/lib/db";
import { remixSubjects } from "@/lib/remixes";
import { getUserId, unauthorized } from "@/lib/session";

const querySchema = z.object({ source: z.enum(["all", "remix", "recipe"]).default("all") });

// The Earnings screen (shared by remixes and reel recipes): totals, and what each song or recipe
// earned. Each source describes its own subjects; recipes add theirs next to remixSubjects.
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const db = getDb();
  const source = parsed.data.source === "all" ? undefined : parsed.data.source;
  const [totals, bySubject] = await Promise.all([earningTotals(db, userId), earningsBySubject(db, userId, source, { remix: remixSubjects })]);
  return NextResponse.json({ ...totals, rateBp: EARN_RATE_BP, bySubject });
}
