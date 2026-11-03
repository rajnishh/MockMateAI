import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { CORS, preflight } from "@/lib/oauth/config";
import { OAuthError, registerClient } from "@/lib/oauth/server";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";

// Registrations per address per hour; claude.ai registers once per connector.
const HOURLY = 30;

// Dynamic client registration (RFC 7591), open to any assistant. Clients are public by default.
export async function POST(req: Request) {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (!(await allow(getRedis(), `ratelimit:oauth-register:${ip}`, HOURLY, 3600))) {
    return NextResponse.json({ error: "slow_down", error_description: "Too many registrations. Try again later." }, { status: 429, headers: CORS });
  }
  try {
    const client = await registerClient(getDb(), await req.json().catch(() => null));
    return NextResponse.json(client, { status: 201, headers: { ...CORS, "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof OAuthError) return NextResponse.json(e.body(), { status: e.status, headers: CORS });
    throw e;
  }
}

export const OPTIONS = preflight;
