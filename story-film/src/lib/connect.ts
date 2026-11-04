import { type Env, requireKey } from "@/lib/env";
import { buildInstagramAuthUrl, InstagramClient, type InstagramApp } from "@/lib/instagram";
import { signToken, verifyToken } from "@/lib/signed";
import { buildAuthUrl } from "@/lib/youtube";
import { tokenKey, youtubeOAuth } from "@/lib/youtube-config";

export type Platform = "youtube" | "instagram";
// Where to send the person after connecting: the web calendar or back into the mobile app.
export type ReturnTo = "web" | "app";

interface ConnectState extends Record<string, unknown> {
  uid: string;
  p: Platform;
  r: ReturnTo;
}

export const APP_RETURN_URL = "reelkar://connected";

export function youtubeAvailable(env: Env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.TOKEN_ENCRYPTION_KEY);
}

export function instagramAvailable(env: Env): boolean {
  return Boolean(env.INSTAGRAM_APP_ID && env.INSTAGRAM_APP_SECRET && env.TOKEN_ENCRYPTION_KEY);
}

export function instagramApp(env: Env): InstagramApp {
  return {
    appId: requireKey(env.INSTAGRAM_APP_ID, "INSTAGRAM_APP_ID"),
    appSecret: requireKey(env.INSTAGRAM_APP_SECRET, "INSTAGRAM_APP_SECRET"),
    redirectUri: `${env.BETTER_AUTH_URL}/api/connect/instagram/callback`,
  };
}

export function instagramClient(env: Env): InstagramClient {
  return new InstagramClient(instagramApp(env));
}

// The OAuth state is signed and names the user, so the callback works from the app's
// in-app browser too, where there is no web session cookie. It expires after 10 minutes.
export function connectUrl(env: Env, platform: Platform, userId: string, returnTo: ReturnTo): string {
  const state = signToken({ uid: userId, p: platform, r: returnTo }, tokenKey(env), "connect", 600);
  return platform === "youtube" ? buildAuthUrl(youtubeOAuth(env), state) : buildInstagramAuthUrl(instagramApp(env), state);
}

export function readConnectState(env: Env, platform: Platform, state: string | null): ConnectState | null {
  const s = verifyToken<ConnectState>(state, tokenKey(env), "connect");
  return s && s.p === platform ? s : null;
}

// Where the callback sends the person, with the outcome in the query string.
export function connectResultUrl(base: string, returnTo: ReturnTo, platform: Platform, error?: string): string {
  const url = new URL(returnTo === "app" ? APP_RETURN_URL : `${base}/calendar`);
  url.searchParams.set("platform", platform);
  if (error) url.searchParams.set("error", error.slice(0, 200));
  else url.searchParams.set("connected", platform);
  return url.toString();
}
