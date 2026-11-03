import { tokenOwner } from "@/lib/agent/tokens";
import type { Db } from "@/lib/db";
import { CORS } from "./config";
import { accessTokenOwner, resourceFor, wwwAuthenticate } from "./server";

export interface ConnectorOwner {
  userId: string;
  timeZone: string;
  // The app's registered name for OAuth sign-ins, for "Via Claude: …" in Ask Reelkar.
  clientName?: string;
}

// Who is calling /api/mcp: a personal rk_ key from /connect, or an OAuth access token for this endpoint.
export async function connectorOwner(db: Db, authorization: string | null, issuer: string): Promise<ConnectorOwner | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  return (await tokenOwner(db, token)) ?? (await accessTokenOwner(db, token, resourceFor(issuer)));
}

// 401 with the challenge that starts sign-in in claude.ai and other assistants (RFC 9728 §5.1).
export function connectorUnauthorized(issuer: string, hadToken: boolean) {
  return Response.json(
    { error: "Sign in to Reelkar, or add a personal key from /connect as a Bearer token." },
    { status: 401, headers: { ...CORS, "WWW-Authenticate": wwwAuthenticate(issuer, hadToken) } },
  );
}
