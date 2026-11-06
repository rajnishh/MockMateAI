import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { recipeState, setRecipeSharing } from "@/lib/recipes";
import { getUserId, unauthorized } from "@/lib/session";

// Stop sharing: it leaves Recipes and its link stops working. Reels people made stay theirs.
export async function POST(_req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { publicId } = await params;
  const r = await setRecipeSharing(getDb(), userId, publicId, false);
  if ("error" in r) return NextResponse.json(r, { status: r.status });
  return NextResponse.json({ state: recipeState(r) });
}
