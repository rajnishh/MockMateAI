import { signToken, verifyToken } from "@/lib/signed";

// Instagram downloads the video from a URL, so a post gets a link that works without
// signing in but only for this film and only for a short time.
const TTL_SEC = 2 * 3600;

export function publicVideoUrl(baseUrl: string, keyB64: string, filmId: string): string {
  return `${baseUrl}/api/public/video/${signToken({ f: filmId }, keyB64, "video", TTL_SEC)}.mp4`;
}

export function filmIdFromVideoToken(token: string, keyB64: string): string | null {
  return verifyToken<{ f: string }>(token.replace(/\.mp4$/, ""), keyB64, "video")?.f ?? null;
}
