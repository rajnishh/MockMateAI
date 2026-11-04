import { NextResponse } from "next/server";
import { z } from "zod";
import { revokeToken } from "@/lib/agent/tokens";
import { getDb } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/session";

// Removes a key; any assistant using it loses access at once.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success || !(await revokeToken(getDb(), userId, id.data))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
