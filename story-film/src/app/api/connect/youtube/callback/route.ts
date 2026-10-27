import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { getUserId } from "@/lib/session";
import { saveYouTubeAccount } from "@/lib/social-accounts";
import { STATE_COOKIE, tokenKey, youtubeClient } from "@/lib/youtube-config";

function sameState(a: string | undefined, b: string | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/calendar?${q}`, req.url));
  const userId = await getUserId();
  if (!userId) return NextResponse.redirect(new URL("/login", req.url));

  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete({ name: STATE_COOKIE, path: "/api/connect/youtube" });
  if (!sameState(expected, url.searchParams.get("state"))) return back("error=state");
  if (url.searchParams.get("error")) return back("error=denied");
  const code = url.searchParams.get("code");
  if (!code) return back("error=denied");

  const env = loadEnv();
  try {
    const yt = youtubeClient(env);
    const tokens = await yt.exchangeCode(code);
    const channel = await yt.getChannel(tokens.accessToken);
    await saveYouTubeAccount(getDb(), tokenKey(env), userId, channel, tokens);
    return back("connected=youtube");
  } catch (err) {
    return back(`error=${encodeURIComponent((err as Error).message.slice(0, 200))}`);
  }
}
