import { NextResponse } from "next/server";
import { connectUrl, youtubeAvailable } from "@/lib/connect";
import { loadEnv } from "@/lib/env";
import { getUserId, unauthorized } from "@/lib/session";

// Web: the "Connect YouTube" link redirects straight to Google.
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.redirect(connectUrl(loadEnv(), "youtube", userId, "web"));
}

// Mobile app: returns the URL to open in the in-app browser; Google sends the person back to reelkar://.
export async function POST() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const env = loadEnv();
  if (!youtubeAvailable(env)) return NextResponse.json({ error: "YouTube posting isn't set up on this server yet" }, { status: 503 });
  return NextResponse.json({ url: connectUrl(env, "youtube", userId, "app") });
}
