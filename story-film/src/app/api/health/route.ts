import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getRedis } from "@/lib/queue/films";

// Used by Docker and uptime monitors: the app is healthy when it can reach Postgres and Redis.
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    await getRedis().ping();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 503 });
  }
}

export const dynamic = "force-dynamic";
