// Instagram API with Instagram Login (professional accounts, no Facebook Page needed).
// Docs: developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
export const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];

const AUTH_URL = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const GRAPH = "https://graph.instagram.com";
const VERSION = "v26.0";

export interface InstagramApp {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

export interface InstagramToken {
  accessToken: string;
  expiresAt: Date;
}

export interface InstagramProfile {
  id: string;
  username: string;
  imageUrl?: string;
  accountType?: string;
}

export function buildInstagramAuthUrl(app: InstagramApp, state: string): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: app.appId,
    redirect_uri: app.redirectUri,
    response_type: "code",
    scope: INSTAGRAM_SCOPES.join(","),
    state,
  }).toString();
  return url.toString();
}

type Sleep = (ms: number) => Promise<void>;

export class InstagramClient {
  constructor(
    private readonly app: InstagramApp,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly sleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  // Authorization code → short-lived token → long-lived (60-day) token.
  async exchangeCode(code: string): Promise<{ token: InstagramToken; userId: string }> {
    const res = await this.fetchFn(TOKEN_URL, {
      method: "POST",
      body: new URLSearchParams({
        client_id: this.app.appId,
        client_secret: this.app.appSecret,
        grant_type: "authorization_code",
        redirect_uri: this.app.redirectUri,
        // Instagram appends "#_" to the code in the redirect.
        code: code.replace(/#_$/, ""),
      }),
    });
    const body = (await res.json()) as Record<string, unknown> & { data?: Record<string, unknown>[] };
    // The docs show both a flat object and a { data: [...] } wrapper.
    const short = (body.data?.[0] ?? body) as { access_token?: string; user_id?: string | number; error_message?: string };
    if (!res.ok || !short.access_token) throw new InstagramError(`Instagram sign-in: ${short.error_message ?? res.status}`);
    const long = await this.get<{ access_token: string; expires_in: number }>("/access_token", {
      grant_type: "ig_exchange_token",
      client_secret: this.app.appSecret,
      access_token: short.access_token,
    }, false);
    return { token: toToken(long), userId: String(short.user_id ?? "") };
  }

  // Long-lived tokens can be refreshed for another 60 days once they are 24 hours old.
  async refresh(accessToken: string): Promise<InstagramToken> {
    return toToken(await this.get<{ access_token: string; expires_in: number }>("/refresh_access_token", { grant_type: "ig_refresh_token", access_token: accessToken }, false));
  }

  async getProfile(accessToken: string): Promise<InstagramProfile> {
    const me = await this.get<{ user_id?: string; id: string; username: string; profile_picture_url?: string; account_type?: string }>("/me", {
      fields: "user_id,username,profile_picture_url,account_type",
      access_token: accessToken,
    });
    return { id: me.user_id ?? me.id, username: me.username, imageUrl: me.profile_picture_url, accountType: me.account_type };
  }

  // Creates a Reels container from a public video URL, waits for Instagram to process it, then publishes.
  async publishReel(accessToken: string, igUserId: string, videoUrl: string, caption: string): Promise<{ id: string; url: string }> {
    const container = await this.post<{ id: string }>(`/${igUserId}/media`, {
      media_type: "REELS",
      video_url: videoUrl,
      caption: caption.slice(0, 2200),
      share_to_feed: "true",
      access_token: accessToken,
    });
    // Meta suggests checking about once a minute for up to 5 minutes.
    for (let attempt = 0; ; attempt++) {
      const { status_code } = await this.get<{ status_code: string }>(`/${container.id}`, { fields: "status_code", access_token: accessToken });
      if (status_code === "FINISHED") break;
      if (status_code === "ERROR" || status_code === "EXPIRED") throw new InstagramError(`Instagram couldn't process the video (${status_code})`);
      if (attempt >= 10) throw new InstagramError("Instagram is still processing the video; try again in a few minutes");
      await this.sleep(30_000);
    }
    const published = await this.post<{ id: string }>(`/${igUserId}/media_publish`, { creation_id: container.id, access_token: accessToken });
    const media = await this.get<{ permalink?: string }>(`/${published.id}`, { fields: "permalink", access_token: accessToken }).catch(() => ({ permalink: undefined }));
    return { id: published.id, url: media.permalink ?? "https://www.instagram.com/" };
  }

  private async get<T>(path: string, params: Record<string, string>, versioned = true): Promise<T> {
    const url = `${GRAPH}${versioned ? `/${VERSION}` : ""}${path}?${new URLSearchParams(params)}`;
    return this.parse<T>(await this.fetchFn(url));
  }

  private async post<T>(path: string, params: Record<string, string>): Promise<T> {
    return this.parse<T>(await this.fetchFn(`${GRAPH}/${VERSION}${path}`, { method: "POST", body: new URLSearchParams(params) }));
  }

  private async parse<T>(res: Response): Promise<T> {
    const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number; type?: string } };
    if (!res.ok || body.error) {
      const e = body.error;
      // 190 = invalid or expired token: the person has to connect again.
      throw new InstagramError(`Instagram ${res.status}: ${e?.message ?? "request failed"}`, e?.code === 190);
    }
    return body;
  }
}

function toToken(t: { access_token: string; expires_in: number }): InstagramToken {
  return { accessToken: t.access_token, expiresAt: new Date(Date.now() + (t.expires_in ?? 60 * 86400) * 1000) };
}

export class InstagramError extends Error {
  constructor(
    message: string,
    readonly needsReconnect = false,
  ) {
    super(message);
  }
}
