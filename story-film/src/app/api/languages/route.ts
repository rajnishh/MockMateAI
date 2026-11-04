import { NextResponse } from "next/server";
import { loadEnv } from "@/lib/env";
import { LANGUAGES } from "@/lib/languages";
import { buildTts } from "@/lib/providers";

// Which narration languages this server can speak right now.
export async function GET() {
  const tts = buildTts(loadEnv());
  return NextResponse.json({
    languages: LANGUAGES.map((l) => ({ code: l.code, name: l.name, native: l.native, available: tts.supports(l.code) })),
  });
}
