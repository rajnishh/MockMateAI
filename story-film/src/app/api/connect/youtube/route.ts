import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { loadEnv } from "@/lib/env";
import { getUserId } from "@/lib/session";
import { buildAuthUrl } from "@/lib/youtube";
import { STATE_COOKIE, youtubeOAuth } from "@/lib/youtube-config";

export async function GET(req: Request) {
  if (!(await getUserId())) return NextResponse.redirect(new URL("/login", req.url));
  // CSRF protection for the OAuth round trip.
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/api/connect/youtube",
  });
  return NextResponse.redirect(buildAuthUrl(youtubeOAuth(loadEnv()), state));
}
