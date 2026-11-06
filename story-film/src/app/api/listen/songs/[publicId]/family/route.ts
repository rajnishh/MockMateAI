import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { PUBLIC_ID, publicSong, publicState } from "@/lib/listen";
import { familyTree } from "@/lib/remixes";

const querySchema = z.object({
  sort: z.enum(["top", "new"]).default("top"),
  branch: z.string().regex(PUBLIC_ID).optional(),
  offset: z.coerce.number().int().min(0).max(5000).default(0),
});

// A public song's family tree (design/community/remix-spec.md X8): public songs only, with hidden
// songs in the middle of a chain as "No longer available" nodes.
export async function GET(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const db = getDb();
  const found = await publicSong(db, publicId);
  if (!found) return NextResponse.json({ error: "We couldn't find that song." }, { status: 404 });
  if (publicState(found.song) !== "public") return NextResponse.json({ error: "This song isn't public any more." }, { status: 410 });
  return NextResponse.json(await familyTree(db, found.song, parsed.data));
}
