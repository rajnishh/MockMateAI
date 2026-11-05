import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { declineDuet, duetByToken, duetErrorResponse } from "@/lib/duets";
import { getUserId, unauthorized } from "@/lib/session";

const declineSchema = z.object({ note: z.string().max(140).default("") });

// "Not this time", with an optional note for the person who asked.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const db = getDb();
  const d = await duetByToken(db, (await params).token);
  if (!d) return NextResponse.json({ error: "We couldn't find this invite." }, { status: 404 });
  const parsed = declineSchema.safeParse(await req.json().catch(() => ({})));
  try {
    await declineDuet(db, d, userId, parsed.data?.note ?? "");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return duetErrorResponse(err);
  }
}
