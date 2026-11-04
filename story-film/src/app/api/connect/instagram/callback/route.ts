import { NextResponse } from "next/server";
import { connectResultUrl, instagramClient, readConnectState } from "@/lib/connect";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { saveInstagramAccount } from "@/lib/social-accounts";
import { tokenKey } from "@/lib/youtube-config";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const env = loadEnv();
  const state = readConnectState(env, "instagram", url.searchParams.get("state"));
  if (!state) return NextResponse.redirect(connectResultUrl(env.BETTER_AUTH_URL, "web", "instagram", "The connection link expired. Try again."));
  const back = (error?: string) => NextResponse.redirect(connectResultUrl(env.BETTER_AUTH_URL, state.r, "instagram", error));

  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code) return back("You didn't allow access to Instagram.");
  try {
    const ig = instagramClient(env);
    const { token } = await ig.exchangeCode(code);
    const profile = await ig.getProfile(token.accessToken);
    // Only professional accounts (Creator or Business) can publish through the API.
    if (profile.accountType && !["BUSINESS", "MEDIA_CREATOR", "CREATOR"].includes(profile.accountType)) {
      return back("Switch your Instagram to a Creator or Business account (free, in Instagram settings), then connect again.");
    }
    await saveInstagramAccount(getDb(), tokenKey(env), state.uid, profile, token);
    return back();
  } catch (err) {
    return back((err as Error).message);
  }
}
