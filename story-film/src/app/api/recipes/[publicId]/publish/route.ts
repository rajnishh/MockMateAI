import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { recipeState, setRecipeSharing } from "@/lib/recipes";
import { getUserId, unauthorized } from "@/lib/session";

// Share again after the maker stopped sharing.
export async function POST(_req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { publicId } = await params;
  const r = await setRecipeSharing(getDb(), userId, publicId, true);
  if ("error" in r) return NextResponse.json(r, { status: r.status });
  return NextResponse.json({ state: recipeState(r) });
}
