import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { listenHome } from "@/lib/listen";
import { getUserId, unauthorized } from "@/lib/session";

// The Listen screen's rails, optionally for one language (?lang=pa).
export async function GET(req: Request) {
  const viewerId = await getUserId();
  if (!viewerId) return unauthorized();
  const lang = new URL(req.url).searchParams.get("lang")?.slice(0, 12) || undefined;
  return NextResponse.json(await listenHome(getDb(), { lang, viewerId }));
}
