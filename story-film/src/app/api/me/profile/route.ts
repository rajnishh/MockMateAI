import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { suggestHandles } from "@/lib/listen";
import { myProfile, NAME_MAX, profileSchema, saveProfile } from "@/lib/profile";
import { getUserId, unauthorized } from "@/lib/session";

// The creator's profile: name, @handle (the Listen handle) and photo, with what's still missing.
// GET ?suggest=name gives free handle ideas for a name typed in the form.
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const suggest = new URL(req.url).searchParams.get("suggest");
  if (suggest !== null) return NextResponse.json({ suggestions: await suggestHandles(getDb(), suggest.slice(0, NAME_MAX)) });
  return NextResponse.json(await myProfile(getDb(), userId));
}

// Saves the fields given; empty ones are skipped. A refused field comes back as { error, field }.
export async function PUT(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = profileSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Check your profile details." }, { status: 400 });
  const db = getDb();
  const r = await saveProfile(db, loadEnv().OUTPUT_DIR, userId, parsed.data);
  if ("error" in r) return NextResponse.json({ error: r.error, field: r.field }, { status: r.status });
  return NextResponse.json(await myProfile(db, userId));
}
