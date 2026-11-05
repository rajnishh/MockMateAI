import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { publicSong, saveSongReport, songReportSchema } from "@/lib/listen";
import { clientIp } from "@/lib/listen-http";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { getUserId } from "@/lib/session";

// The Report button on every public song. No sign-in needed; a person reviews each report.
export async function POST(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  if (!(await allow(getRedis(), `ratelimit:song-report:${clientIp(req)}`, 10, 3600))) {
    return NextResponse.json({ error: "You've sent a lot of reports. Try again in an hour." }, { status: 429 });
  }
  const parsed = songReportSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const db = getDb();
  const found = await publicSong(db, publicId);
  if (!found) return NextResponse.json({ error: "We couldn't find this song." }, { status: 404 });
  await saveSongReport(db, found.song.id, parsed.data, await getUserId().catch(() => undefined));
  return NextResponse.json({ ok: true }, { status: 201 });
}
