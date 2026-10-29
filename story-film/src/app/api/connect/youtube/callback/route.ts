import { NextResponse } from "next/server";
import { connectResultUrl, readConnectState } from "@/lib/connect";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { saveYouTubeAccount } from "@/lib/social-accounts";
import { tokenKey, youtubeClient } from "@/lib/youtube-config";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const env = loadEnv();
  // The signed state proves which user started the connection (and guards against CSRF).
  const state = readConnectState(env, "youtube", url.searchParams.get("state"));
  if (!state) return NextResponse.redirect(connectResultUrl(env.BETTER_AUTH_URL, "web", "youtube", "The connection link expired. Try again."));
  const back = (error?: string) => NextResponse.redirect(connectResultUrl(env.BETTER_AUTH_URL, state.r, "youtube", error));

  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code) return back("You didn't allow access to YouTube.");
  try {
    const yt = youtubeClient(env);
    const tokens = await yt.exchangeCode(code);
    const channel = await yt.getChannel(tokens.accessToken);
    await saveYouTubeAccount(getDb(), tokenKey(env), state.uid, channel, tokens);
    return back();
  } catch (err) {
    return back((err as Error).message);
  }
}
