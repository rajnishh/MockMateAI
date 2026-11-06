import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { recipesHome } from "@/lib/recipes";
import { getUserId } from "@/lib/session";

// Create's festival card and "Start from a recipe" rail, and the gallery (?lang=en|hi|ar&tz=Asia/Dubai).
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const viewerId = await getUserId().catch(() => undefined);
  return NextResponse.json(await recipesHome(getDb(), { viewerId, lang: q.get("lang"), tz: q.get("tz") }));
}
