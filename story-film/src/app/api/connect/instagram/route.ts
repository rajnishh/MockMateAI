import { NextResponse } from "next/server";
import { connectUrl, instagramAvailable } from "@/lib/connect";
import { loadEnv } from "@/lib/env";
import { getUserId, unauthorized } from "@/lib/session";

// Web: redirect to Instagram's login and permission screen.
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.redirect(connectUrl(loadEnv(), "instagram", userId, "web"));
}

// Mobile app: returns the URL to open in the in-app browser.
export async function POST() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const env = loadEnv();
  if (!instagramAvailable(env)) return NextResponse.json({ error: "Instagram posting isn't set up on this server yet" }, { status: 503 });
  return NextResponse.json({ url: connectUrl(env, "instagram", userId, "app") });
}
