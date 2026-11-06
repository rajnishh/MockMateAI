import { NextResponse } from "next/server";
import { z } from "zod";
import { llmForUser } from "@/lib/ai/engines";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { editRecipe, editRecipeSchema } from "@/lib/recipes";
import { getUserId, unauthorized } from "@/lib/session";
import { assertNoRealArtists, SongSafetyError } from "@/lib/songs/safety";

// The maker's Edit name and festival.
export async function PATCH(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { publicId } = await params;
  const parsed = editRecipeSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const db = getDb();
  try {
    const r = await editRecipe(db, userId, publicId, parsed.data, async (texts) => assertNoRealArtists(await llmForUser(db, loadEnv(), userId), texts));
    if ("error" in r) return NextResponse.json(r, { status: r.status });
    return NextResponse.json({ name: r.name, occasions: r.occasions });
  } catch (err) {
    if (err instanceof SongSafetyError) return NextResponse.json({ error: "We can't use this name: it names a real person or artist. Change it and try again." }, { status: 400 });
    console.error("recipe edit check failed", err);
    return NextResponse.json({ error: "We couldn't check the new name right now. Try again in a minute." }, { status: 502 });
  }
}
