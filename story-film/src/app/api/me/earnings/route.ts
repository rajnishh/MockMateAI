import { NextResponse } from "next/server";
import { z } from "zod";
import { EARN_RATE_BP } from "@/lib/billing/catalog";
import { earningsBySubject, earningTotals } from "@/lib/billing/earnings";
import { getDb } from "@/lib/db";
import { recipeFreeUses, recipeStates, recipeSubjects } from "@/lib/recipes";
import { remixSubjects } from "@/lib/remixes";
import { getUserId, unauthorized } from "@/lib/session";

const querySchema = z.object({ source: z.enum(["all", "remix", "recipe"]).default("all") });

// The Earnings screen (shared by remixes and reel recipes): totals, and what each song or recipe
// earned. Each source describes its own subjects. Recipe rows add their free uses ("38 uses · 12
// free") and whether the recipe was stopped or removed.
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const db = getDb();
  const source = parsed.data.source === "all" ? undefined : parsed.data.source;
  const [totals, rows] = await Promise.all([earningTotals(db, userId), earningsBySubject(db, userId, source, { remix: remixSubjects, recipe: recipeSubjects })]);
  const recipeIds = rows.filter((r) => r.source === "recipe").map((r) => r.subjectRef);
  const [free, states] = await Promise.all([recipeFreeUses(db, recipeIds), recipeStates(db, recipeIds)]);
  const bySubject = rows.map((r) => (r.source === "recipe" ? { ...r, freeUses: free.get(r.subjectRef) ?? 0, state: states.get(r.subjectRef) ?? "stopped" } : r));
  return NextResponse.json({ ...totals, rateBp: EARN_RATE_BP, bySubject });
}
