import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos";

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface Tokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

export interface Channel {
  id: string;
  title: string;
  imageUrl?: string;
}

export interface UploadMetadata {
  title: string;
  description: string;
  tags: string[];
  privacy: "public" | "unlisted" | "private";
  madeForKids: boolean;
}

export function buildAuthUrl(client: OAuthClient, state: string): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPES.join(" "),
    // offline + consent guarantees a refresh token, needed for scheduled uploads.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  }).toString();
  return url.toString();
}

export class YouTubeClient {
  constructor(
    private readonly client: OAuthClient,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  exchangeCode(code: string): Promise<Tokens> {
    return this.token({ code, grant_type: "authorization_code", redirect_uri: this.client.redirectUri });
  }

  refresh(refreshToken: string): Promise<Tokens> {
    return this.token({ refresh_token: refreshToken, grant_type: "refresh_token" });
  }

  private async token(params: Record<string, string>): Promise<Tokens> {
    const res = await this.fetchFn(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.client.clientId, client_secret: this.client.clientSecret, ...params }),
    });
    const body = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!res.ok || !body.access_token) throw new YouTubeError(`Google token: ${body.error_description ?? body.error ?? res.status}`, body.error === "invalid_grant");
    return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresAt: new Date(Date.now() + (body.expires_in ?? 3600) * 1000) };
  }

  async getChannel(accessToken: string): Promise<Channel> {
    const res = await this.fetchFn(`${API}/channels?part=snippet&mine=true`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new YouTubeError(`YouTube channels ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { items?: { id: string; snippet: { title: string; thumbnails?: { default?: { url: string } } } }[] };
    const item = body.items?.[0];
    if (!item) throw new YouTubeError("This Google account has no YouTube channel yet. Create one on YouTube, then connect again.");
    return { id: item.id, title: item.snippet.title, imageUrl: item.snippet.thumbnails?.default?.url };
  }

  // Resumable upload: one request for the metadata, one PUT for the bytes.
  async upload(accessToken: string, file: string, meta: UploadMetadata): Promise<{ id: string; url: string; privacy: string }> {
    const { size } = await stat(file);
    const start = await this.fetchFn(`${UPLOAD}?uploadType=resumable&part=snippet,status`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(size),
      },
      body: JSON.stringify({
        snippet: { title: meta.title.slice(0, 100), description: meta.description.slice(0, 5000), tags: meta.tags, categoryId: "22" },
        status: {
          privacyStatus: meta.privacy,
          selfDeclaredMadeForKids: meta.madeForKids,
          // Platform AI disclosure ("altered or synthetic content").
          containsSyntheticMedia: true,
        },
      }),
    });
    const location = start.headers.get("location");
    if (!start.ok || !location) throw new YouTubeError(`YouTube upload start ${start.status}: ${await start.text()}`);

    const put = await this.fetchFn(location, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4", "Content-Length": String(size) },
      body: Readable.toWeb(createReadStream(file)) as ReadableStream,
      // Node's fetch needs this to stream a request body.
      duplex: "half",
    } as RequestInit);
    if (!put.ok) throw new YouTubeError(`YouTube upload ${put.status}: ${await put.text()}`);
    const video = (await put.json()) as { id: string; status?: { privacyStatus?: string } };
    return { id: video.id, url: `https://youtube.com/shorts/${video.id}`, privacy: video.status?.privacyStatus ?? meta.privacy };
  }
}

export class YouTubeError extends Error {
  constructor(
    message: string,
    // The user revoked access or the refresh token expired: they must reconnect.
    readonly needsReconnect = false,
  ) {
    super(message);
  }
}
