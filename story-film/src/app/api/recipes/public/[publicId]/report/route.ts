import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { clientIp } from "@/lib/listen-http";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { publicRecipe, recipeReportSchema, saveRecipeReport } from "@/lib/recipes";
import { getUserId } from "@/lib/session";

// Report on every public recipe. No sign-in needed; a person reviews each report. A signed-in
// reporter no longer sees the recipe in the app's lists.
export async function POST(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  if (!(await allow(getRedis(), `ratelimit:recipe-report:${clientIp(req)}`, 10, 3600))) {
    return NextResponse.json({ error: "You've sent a lot of reports. Try again in an hour." }, { status: 429 });
  }
  const parsed = recipeReportSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const db = getDb();
  const found = await publicRecipe(db, publicId);
  if (!found) return NextResponse.json({ error: "We couldn't find this recipe." }, { status: 404 });
  await saveRecipeReport(db, found.recipe.id, parsed.data, await getUserId().catch(() => undefined));
  return NextResponse.json({ ok: true }, { status: 201 });
}
