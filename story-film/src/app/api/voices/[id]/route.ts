import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/session";
import { deleteVoice } from "@/lib/voice/profiles";

// Deletes the voice recording; songs already made with it stay in the library.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const ok = await deleteVoice(getDb(), userId, id).catch(() => false);
  return ok ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
