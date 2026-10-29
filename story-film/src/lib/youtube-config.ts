import { type Env, requireKey } from "@/lib/env";
import { YouTubeClient } from "@/lib/youtube";

// Same Google OAuth client as sign-in, with an extra redirect URI for channel connections.
export function youtubeOAuth(env: Env) {
  return {
    clientId: requireKey(env.GOOGLE_CLIENT_ID, "GOOGLE_CLIENT_ID"),
    clientSecret: requireKey(env.GOOGLE_CLIENT_SECRET, "GOOGLE_CLIENT_SECRET"),
    redirectUri: `${env.BETTER_AUTH_URL}/api/connect/youtube/callback`,
  };
}

export function youtubeClient(env: Env): YouTubeClient {
  return new YouTubeClient(youtubeOAuth(env));
}

export function tokenKey(env: Env): string {
  return requireKey(env.TOKEN_ENCRYPTION_KEY, "TOKEN_ENCRYPTION_KEY");
}
