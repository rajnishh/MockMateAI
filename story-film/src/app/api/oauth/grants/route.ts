import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { listGrants } from "@/lib/oauth/server";
import { getUserId, unauthorized } from "@/lib/session";

// Apps the creator connected with sign-in (claude.ai, the Claude phone app...), for /connect.
export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  return NextResponse.json({ apps: await listGrants(getDb(), userId) });
}
