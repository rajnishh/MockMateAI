import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Short-lived, tamper-proof tokens (OAuth state, public video links). The signing key is
// derived per purpose from TOKEN_ENCRYPTION_KEY, so one token can't be reused as another.
function sigFor(body: string, keyB64: string, purpose: string): Buffer {
  const derived = createHmac("sha256", Buffer.from(keyB64, "base64")).update(`reelkar:${purpose}`).digest();
  return createHmac("sha256", derived).update(body).digest();
}

export function signToken(payload: Record<string, unknown>, keyB64: string, purpose: string, ttlSec: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec, n: randomBytes(6).toString("base64url") })).toString("base64url");
  return `${body}.${sigFor(body, keyB64, purpose).toString("base64url")}`;
}

export function verifyToken<T extends Record<string, unknown>>(token: string | null | undefined, keyB64: string, purpose: string): T | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sigFor(body, keyB64, purpose);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp: number };
    return payload.exp >= Math.floor(Date.now() / 1000) ? payload : null;
  } catch {
    return null;
  }
}
