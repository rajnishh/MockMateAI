import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { revokeGrant } from "@/lib/oauth/server";
import { getUserId, unauthorized } from "@/lib/session";

// Disconnects an app: its tokens stop working at once, and it has to ask again.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success || !(await revokeGrant(getDb(), userId, id.data))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
