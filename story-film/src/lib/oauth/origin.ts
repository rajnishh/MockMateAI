// The public address Reelkar is reached at. Assistants connect from the internet (a Cloudflare
// Tunnel, a named domain or a server), so the OAuth issuer and metadata links follow the address
// the request came in on, but only when it's one Reelkar trusts. Anything else falls back to
// BETTER_AUTH_URL, so a forged Host header can't move the issuer somewhere else.

export interface OriginConfig {
  baseURL: string; // BETTER_AUTH_URL
  extra: string[]; // PUBLIC_ORIGINS, comma separated in .env
  dev: boolean; // development also trusts quick tunnels (https://*.trycloudflare.com)
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const originOf = (url: string) => new URL(url).origin;

export function parseOrigins(list: string | undefined): string[] {
  return (list ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => {
      try {
        return [originOf(s)];
      } catch {
        return [];
      }
    });
}

export function isTrustedOrigin(origin: string, cfg: OriginConfig): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.origin !== origin) return false;
  if (origin === originOf(cfg.baseURL) || cfg.extra.includes(origin)) return true;
  if (url.protocol === "http:" && LOOPBACK.has(url.hostname)) return true;
  return cfg.dev && url.protocol === "https:" && url.hostname.endsWith(".trycloudflare.com") && !url.port;
}

export function publicOrigin(headers: Headers, cfg: OriginConfig): string {
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
  const forwarded = headers.get("x-forwarded-proto")?.split(",")[0].trim().toLowerCase();
  const hostname = host.replace(/:\d+$/, "");
  const proto = forwarded === "https" || forwarded === "http" ? forwarded : LOOPBACK.has(hostname) ? "http" : "https";
  const candidate = `${proto}://${host}`;
  return host && isTrustedOrigin(candidate, cfg) ? candidate : originOf(cfg.baseURL);
}
