import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { getUserId, unauthorized } from "@/lib/session";
import { accountView, listAccounts } from "@/lib/social-accounts";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const env = loadEnv();
  return NextResponse.json({
    youtubeAvailable: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.TOKEN_ENCRYPTION_KEY),
    accounts: (await listAccounts(getDb(), userId)).map(accountView),
  });
}
