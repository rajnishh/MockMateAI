import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProfile, handleProblem, handleTaken, nextHandleChange, setHandle, suggestHandles } from "@/lib/listen";
import { getUserId, unauthorized } from "@/lib/session";

// The creator's Listen handle. GET ?check=name says whether a handle can be used.
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const db = getDb();
  const check = new URL(req.url).searchParams.get("check");
  if (check !== null) {
    const h = check.trim().toLowerCase().replace(/^@/, "");
    const problem = handleProblem(h) ?? ((await handleTaken(db, h, userId)) ? `@${h} is taken. Try another.` : null);
    return NextResponse.json({ handle: h, ok: !problem, problem });
  }
  const profile = await getProfile(db, userId);
  const [me] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
  return NextResponse.json({
    handle: profile?.handle ?? null,
    canChangeAt: profile ? nextHandleChange(profile.handleChangedAt).toISOString() : null,
    suggestions: profile ? [] : await suggestHandles(db, me?.name ?? ""),
  });
}

export async function PUT(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = z.object({ handle: z.string().max(40) }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Pick a handle" }, { status: 400 });
  const r = await setHandle(getDb(), userId, parsed.data.handle);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r);
}
