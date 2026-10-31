import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for OAuth tokens at rest. Output: base64(iv | tag | ciphertext).
export function encrypt(plain: string, keyB64: string): string {
  const key = parseKey(keyB64);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function decrypt(packed: string, keyB64: string): string {
  const buf = Buffer.from(packed, "base64");
  const decipher = createDecipheriv("aes-256-gcm", parseKey(keyB64), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

function parseKey(keyB64: string): Buffer {
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)");
  return key;
}
