import { randomUUID } from "node:crypto";
import type { NextResponse } from "next/server";

// Shared by the Listen routes: who is asking, for rate limits and play counts.
export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
}

const VISITOR = /^[0-9a-f-]{36}$/;

// A play's listener: the signed-in user, else a random id in a first-party cookie (the same `rk_v`
// cookie the gift page uses). No IP, place or device is kept.
export function listenerFor(req: Request, userId: string | undefined): { listener: string; setCookie?: string } {
  if (userId) return { listener: userId };
  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)rk_v=([^;]+)/)?.[1];
  if (cookie && VISITOR.test(cookie)) return { listener: `v:${cookie}` };
  const fresh = randomUUID();
  return { listener: `v:${fresh}`, setCookie: fresh };
}

export function setVisitorCookie(res: NextResponse, req: Request, value: string | undefined): void {
  if (value) res.cookies.set("rk_v", value, { httpOnly: true, sameSite: "lax", secure: req.url.startsWith("https:"), maxAge: 365 * 86400, path: "/" });
}
