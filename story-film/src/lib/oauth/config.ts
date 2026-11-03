import { headers } from "next/headers";
import { loadEnv } from "@/lib/env";
import { type OriginConfig, parseOrigins, publicOrigin } from "./origin";

let config: OriginConfig | undefined;

export function originConfig(): OriginConfig {
  if (!config) {
    const env = loadEnv();
    config = { baseURL: env.BETTER_AUTH_URL, extra: parseOrigins(env.PUBLIC_ORIGINS), dev: process.env.NODE_ENV === "development" };
  }
  return config;
}

// The OAuth issuer for this request: the public address the assistant reached Reelkar at.
export const issuerFor = (h: Headers) => publicOrigin(h, originConfig());
export const currentIssuer = async () => issuerFor(await headers());

// Metadata, registration and tokens are called from browsers too (MCP Inspector), with no cookies.
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};

export const preflight = () => new Response(null, { status: 204, headers: CORS });
