import { NextResponse } from "next/server";
import { instagramAvailable, youtubeAvailable } from "@/lib/connect";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { getUserId, unauthorized } from "@/lib/session";
import { accountView, listAccounts } from "@/lib/social-accounts";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const env = loadEnv();
  return NextResponse.json({
    youtubeAvailable: youtubeAvailable(env),
    instagramAvailable: instagramAvailable(env),
    accounts: (await listAccounts(getDb(), userId)).map(accountView),
  });
}
