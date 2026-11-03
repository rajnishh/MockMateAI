import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { get } from "node:https";
import { isIP } from "node:net";

// Client ID metadata documents (draft-ietf-oauth-client-id-metadata-document): the client_id is
// an https URL, and the JSON at that URL names the client and its redirect URIs. Reelkar fetches
// it from the server, so the fetch is locked down: https on the default port, public addresses
// only (checked on the address the connection actually uses, so DNS rebinding can't slip an
// internal address in), no redirects, 5 seconds, 16 KB.

export interface ClientDocument {
  clientName: string;
  redirectUris: string[];
}

export type FetchClientDocument = (url: string) => Promise<ClientDocument>;

const MAX_BYTES = 16 * 1024;
const CACHE_MS = 5 * 60 * 1000;
const CACHE_MAX = 200;
const cache = new Map<string, { doc: ClientDocument; until: number }>();

// Remembers a document, dropping the oldest once the cache is full (a Map keeps insertion order).
function remember(url: string, doc: ClientDocument) {
  cache.delete(url);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(url, { doc, until: Date.now() + CACHE_MS });
}

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

// DNS lookup for the fetch itself: refuses private addresses on the very lookup the socket connects with.
function publicLookup(hostname: string, options: object, cb: (err: Error | null, address: string | LookupAddress[], family?: number) => void) {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, []);
    if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) return cb(new Error("Client document host resolves to a private address"), []);
    if ((options as { all?: boolean }).all) return cb(null, addresses);
    cb(null, addresses[0].address, addresses[0].family);
  });
}

// GET with the checks above; no redirects are followed (a 3xx is just an error).
function getDocument(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = get(url, { lookup: publicLookup, headers: { Accept: "application/json" }, timeout: 5000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Client document returned ${res.statusCode}`));
      }
      if (Number(res.headers["content-length"] ?? 0) > MAX_BYTES) {
        res.destroy();
        return reject(new Error("Client document is too large"));
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        body += chunk;
        if (body.length > MAX_BYTES) {
          res.destroy();
          reject(new Error("Client document is too large"));
        }
      });
      res.on("end", () => resolve(body));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("Client document took too long")));
    req.on("error", reject);
  });
}

export const fetchClientDocument: FetchClientDocument = async (url) => {
  const hit = cache.get(url);
  if (hit && hit.until > Date.now()) return hit.doc;
  if (!isClientDocumentUrl(url)) throw new Error("Not a client metadata document URL");
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) || host === "localhost" || host.endsWith(".localhost")) throw new Error("Client documents must be on a public host name");
  const doc = parseClientDocument(url, JSON.parse(await getDocument(url)));
  remember(url, doc);
  return doc;
};
