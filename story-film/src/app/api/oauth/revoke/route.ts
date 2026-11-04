import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { CORS, preflight } from "@/lib/oauth/config";
import { OAuthError, revokeOAuthToken } from "@/lib/oauth/server";

// Token revocation (RFC 7009). Unknown tokens succeed too, as the RFC asks.
export async function POST(req: Request) {
  const form = new URLSearchParams(await req.text().catch(() => ""));
  try {
    await revokeOAuthToken(getDb(), form, req.headers.get("authorization"));
    return new NextResponse(null, { status: 200, headers: CORS });
  } catch (e) {
    if (e instanceof OAuthError) return NextResponse.json(e.body(), { status: e.status, headers: CORS });
    throw e;
  }
}

export const OPTIONS = preflight;
