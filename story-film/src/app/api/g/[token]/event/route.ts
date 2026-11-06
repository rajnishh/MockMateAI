import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { countPlay, giftState, markOpened, publicGift } from "@/lib/gifts";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { notify } from "@/lib/push";
import { giftOpenedText } from "@/lib/push-copy";
import { getUserId } from "@/lib/session";

const eventSchema = z.object({ type: z.enum(["open", "play"]) });
const VISITOR = /^[0-9a-f-]{36}$/;

// "Opened" and plays for the sender's status card. A browser is a random id in a first-party
// cookie: no IP, place or device is kept. The sender's own visits don't count.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = eventSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Unknown event" }, { status: 400 });
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (!(await allow(getRedis(), `ratelimit:gift-event:${ip}`, 120, 3600))) return new NextResponse(null, { status: 429 });
  const db = getDb();
  const found = await publicGift(db, token);
  if (!found || giftState(found) !== "ready") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)rk_v=([^;]+)/)?.[1];
  const visitor = cookie && VISITOR.test(cookie) ? cookie : randomUUID();
  const res = new NextResponse(null, { status: 204 });
  if (visitor !== cookie) res.cookies.set("rk_v", visitor, { httpOnly: true, sameSite: "lax", secure: req.url.startsWith("https:"), maxAge: 365 * 86400, path: "/" });

  if ((await getUserId().catch(() => undefined)) === found.gift.senderId) return res;
  // The sender hears once that it was opened (a play can come first), never who opened it, and
  // never about plays. An open that isn't the first is not a play.
  const first = await markOpened(db, found.gift.id);
  if (parsed.data.type === "play") await countPlay(db, found.gift.id, visitor);
  const { toName, occasion } = found.gift;
  if (first) notify(db, [found.gift.senderId], (lang) => ({ ...giftOpenedText(lang, toName, occasion), path: "/inbox", kind: "gifts" }));
  return res;
}
