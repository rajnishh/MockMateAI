import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { CORS, preflight } from "@/lib/oauth/config";
import { OAuthError, registerClient } from "@/lib/oauth/server";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";

// Registrations per address per hour; claude.ai registers once per connector. The address comes from
// headers a caller can set, so there's also a cap for everyone together.
const HOURLY = 30;
const HOURLY_ALL = 300;

// Dynamic client registration (RFC 7591), open to any assistant. Clients are public by default.
export async function POST(req: Request) {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const redis = getRedis();
  if (!(await allow(redis, `ratelimit:oauth-register:${ip}`, HOURLY, 3600)) || !(await allow(redis, "ratelimit:oauth-register:all", HOURLY_ALL, 3600))) {
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
