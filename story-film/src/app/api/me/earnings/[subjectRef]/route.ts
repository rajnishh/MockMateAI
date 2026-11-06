import { NextResponse } from "next/server";
import { earningEvents } from "@/lib/billing/earnings";
import { getDb } from "@/lib/db";
import { recipeSubjects } from "@/lib/recipes";
import { remixDetails, remixSubjects } from "@/lib/remixes";
import { getUserId, unauthorized } from "@/lib/session";

// What one of the creator's songs (or recipes) earned, newest first, 50 at a time (?cursor= is the
// last row's time). Remixers are named only when their remix is public; people who used a recipe
// stay anonymous ("Someone made a reel").
export async function GET(req: Request, { params }: { params: Promise<{ subjectRef: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { subjectRef } = await params;
  const cursor = new URL(req.url).searchParams.get("cursor");
  const before = cursor && !Number.isNaN(Date.parse(cursor)) ? new Date(cursor) : undefined;
  const db = getDb();
  const page = await earningEvents(db, userId, subjectRef, before);
  const details = await remixDetails(
    db,
    page.events.filter((e) => e.source === "remix").map((e) => e.sourceRef),
  );
  const recipeSubject = (await recipeSubjects(db, [subjectRef])).get(subjectRef);
  const subject = recipeSubject ?? (await remixSubjects(db, [subjectRef])).get(subjectRef);
  const source = recipeSubject ? "recipe" : "remix";
  return NextResponse.json({
    title: subject?.title ?? null,
    source,
    publicId: subject?.publicId ?? null,
    cursor: page.cursor,
    events: page.events.map((e) => {
      const d = details.get(e.sourceRef);
      return { at: e.at, hundredths: e.hundredths, free: e.free, kind: d?.kind ?? null, remixerHandle: d?.remixerHandle ?? null, publicId: d?.publicId ?? null };
    }),
  });
}
