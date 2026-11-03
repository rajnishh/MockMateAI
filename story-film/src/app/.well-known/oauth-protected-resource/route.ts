import { NextResponse } from "next/server";
import { CORS, issuerFor, preflight } from "@/lib/oauth/config";
import { protectedResourceMetadata } from "@/lib/oauth/server";

// RFC 9728 protected-resource metadata for the connector at /api/mcp.
export function GET(req: Request) {
  return NextResponse.json(protectedResourceMetadata(issuerFor(req.headers)), { headers: { ...CORS, "Cache-Control": "public, max-age=300" } });
}

export const OPTIONS = preflight;
