import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

// Phase 0 has no accounts: an anonymous cookie identifies the user for quotas.
// Phase 1 replaces this with real auth (it is trivially reset by clearing cookies).
const COOKIE = "sf_uid";

export async function getUserId(create: boolean): Promise<string | undefined> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing || !create) return existing;
  const id = randomUUID();
  jar.set(COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 });
  return id;
}
