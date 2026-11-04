import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { CORS, issuerFor, preflight } from "@/lib/oauth/config";
import { exchangeToken, OAuthError } from "@/lib/oauth/server";

const NO_STORE = { ...CORS, "Cache-Control": "no-store", Pragma: "no-cache" };

// Token endpoint: authorization_code (with PKCE) and refresh_token (rotated on every use).
export async function POST(req: Request) {
  const form = new URLSearchParams(await req.text().catch(() => ""));
  try {
    const tokens = await exchangeToken(getDb(), form, req.headers.get("authorization"), issuerFor(req.headers));
    return NextResponse.json(tokens, { headers: NO_STORE });
  } catch (e) {
    if (!(e instanceof OAuthError)) throw e;
    const headers: Record<string, string> = { ...NO_STORE };
    if (e.status === 401) headers["WWW-Authenticate"] = 'Basic realm="reelkar"';
    return NextResponse.json(e.body(), { status: e.status, headers });
  }
}

export const OPTIONS = preflight;
