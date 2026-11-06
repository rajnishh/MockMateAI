import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { publicSongCard, relatedSchema, relatedSongs } from "@/lib/listen";
import { getUserId } from "@/lib/session";

// Autoplay's next songs: ?seed=<publicId>&exclude=<publicId,...> (songs already heard this session).
// Open without sign-in too, for "More like this" on the public song page.
export async function GET(req: Request) {
  const parsed = relatedSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const viewerId = await getUserId().catch(() => undefined);
  const rows = await relatedSongs(getDb(), { ...parsed.data, viewerId });
  return NextResponse.json({ songs: rows.map(publicSongCard) });
}
