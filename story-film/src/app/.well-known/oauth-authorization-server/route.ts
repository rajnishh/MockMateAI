import { NextResponse } from "next/server";
import { CORS, issuerFor, preflight } from "@/lib/oauth/config";
import { authorizationServerMetadata } from "@/lib/oauth/server";

// RFC 8414 authorization-server metadata. The issuer is the public address of this request.
export function GET(req: Request) {
  return NextResponse.json(authorizationServerMetadata(issuerFor(req.headers)), { headers: { ...CORS, "Cache-Control": "public, max-age=300" } });
}

export const OPTIONS = preflight;
