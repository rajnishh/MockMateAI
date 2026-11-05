import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { duetView, getDuet, songStatusOf, viewerOf } from "@/lib/duets";
import { loadEnv } from "@/lib/env";
import { getUserId, unauthorized } from "@/lib/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const db = getDb();
  const d = await getDuet(db, (await params).id);
  const role = d ? viewerOf(d, userId) : null;
  if (!d || !role) return NextResponse.json({ error: "Jugalbandi not found" }, { status: 404 });
  return NextResponse.json(duetView(d, role, await songStatusOf(db, d), loadEnv().BETTER_AUTH_URL));
}
