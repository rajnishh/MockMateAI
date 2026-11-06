import { NextResponse } from "next/server";
import { googleEnabled } from "@/lib/auth";

// Which sign-in buttons the apps show: Google only once its OAuth client is set up.
export function GET() {
  return NextResponse.json({ google: googleEnabled, apple: true });
}

export const dynamic = "force-dynamic";
