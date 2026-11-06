import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { clientIp } from "@/lib/listen-http";
import { fileReport, ownerAlert, reportInputSchema } from "@/lib/moderation";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { publicRecipe } from "@/lib/recipes";
import { getUserId } from "@/lib/session";

// Report on every public recipe. No sign-in needed; a person reviews each report within 24 hours. A
// signed-in reporter no longer sees the recipe in the app's lists, and enough reports hide it for
// everyone until then (src/lib/moderation.ts).
export async function POST(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const ip = clientIp(req);
  if (!(await allow(getRedis(), `ratelimit:recipe-report:${ip}`, 10, 3600))) {
    return NextResponse.json({ error: "You've sent a lot of reports. Try again in an hour." }, { status: 429 });
  }
  const parsed = reportInputSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const db = getDb();
  const found = await publicRecipe(db, publicId);
  if (!found) return NextResponse.json({ error: "We couldn't find this recipe." }, { status: 404 });
  const userId = await getUserId().catch(() => undefined);
  await fileReport(db, "recipe", found.recipe.id, parsed.data, { userId, ip }, ownerAlert(loadEnv()));
  return NextResponse.json({ ok: true }, { status: 201 });
}
