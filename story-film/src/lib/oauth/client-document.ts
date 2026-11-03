import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Client ID metadata documents (draft-ietf-oauth-client-id-metadata-document): the client_id is
// an https URL, and the JSON at that URL names the client and its redirect URIs. Reelkar fetches
// it from the server, so the fetch is locked down: https on the default port, public addresses
// only, no redirects, 5 seconds, 16 KB.

export interface ClientDocument {
  clientName: string;
  redirectUris: string[];
}

export type FetchClientDocument = (url: string) => Promise<ClientDocument>;

const MAX_BYTES = 16 * 1024;
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { doc: ClientDocument; until: number }>();

// Redirect URIs must be https, or http on the loopback address (native apps), with no fragment.
export function validRedirectUri(uri: unknown): uri is string {
  if (typeof uri !== "string" || uri.length > 2000) return false;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

export function isClientDocumentUrl(clientId: string): boolean {
  if (!clientId.startsWith("https://")) return false;
  try {
    const url = new URL(clientId);
    return url.pathname.length > 1 && !url.hash && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}

// Loopback, private, link-local, carrier-grade NAT and unique-local addresses.
export function isPrivateAddress(ip: string): boolean {
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || v6.startsWith("ff");
}

export function parseClientDocument(url: string, json: unknown): ClientDocument {
  const d = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  if (d.client_id !== url) throw new Error("client_id in the document doesn't match its URL");
  const uris = d.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10 || !uris.every(validRedirectUri)) throw new Error("redirect_uris is missing or invalid");
  const method = d.token_endpoint_auth_method ?? "none";
  if (method !== "none") throw new Error("Only public clients (token_endpoint_auth_method none) are supported");
  const name = typeof d.client_name === "string" && d.client_name.trim() ? d.client_name.trim().slice(0, 80) : new URL(url).host;
  return { clientName: name, redirectUris: uris as string[] };
}

export const fetchClientDocument: FetchClientDocument = async (url) => {
  const hit = cache.get(url);
  if (hit && hit.until > Date.now()) return hit.doc;
  if (!isClientDocumentUrl(url)) throw new Error("Not a client metadata document URL");
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) || host === "localhost" || host.endsWith(".localhost")) throw new Error("Client documents must be on a public host name");
  const addresses = await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) throw new Error("Client document host resolves to a private address");

  const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Client document returned ${res.status}`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error("Client document is too large");
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error("Client document is too large");
  const doc = parseClientDocument(url, JSON.parse(text));
  cache.set(url, { doc, until: Date.now() + CACHE_MS });
  return doc;
};
