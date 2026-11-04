import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/session";
import { deleteAccount } from "@/lib/social-accounts";

// Disconnecting also deletes that channel's scheduled posts (cascade).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const ok = await deleteAccount(getDb(), userId, id).catch(() => false);
  return ok ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
