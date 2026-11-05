import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { duetMakeDeps } from "@/lib/duet-make";
import { duetErrorResponse, duetView, getDuet, roleOf, savePart, songStatusOf, startJoin } from "@/lib/duets";
import { loadEnv } from "@/lib/env";
import { notify } from "@/lib/push";
import { getUserId, unauthorized } from "@/lib/session";
import { loadTake } from "@/lib/voice-create/takes";

const partSchema = z.object({ takeId: z.string() });

// "Use this" for a part recorded with Hum it (in the app or on the invite page). When both parts
// are in, the song starts.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const env = loadEnv();
  const db = getDb();
  const d = await getDuet(db, (await params).id);
  const role = d ? roleOf(d, userId) : null;
  if (!d || !role) return NextResponse.json({ error: "Jugalbandi not found" }, { status: 404 });
  const parsed = partSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Record your part first" }, { status: 400 });
  // Only this person's own recording; the path comes from their take, never the request.
  const take = await loadTake(env.OUTPUT_DIR, userId, parsed.data.takeId);
  if (!take) return NextResponse.json({ error: "That recording has expired. Record it again." }, { status: 404 });
  try {
    let row = await savePart(db, env.OUTPUT_DIR, d, role, { mp3: take.files.mp3, kind: take.meta.kind, transcript: take.meta.transcript, durationSec: take.meta.durationSec });
    if (row.partAPath && row.partBPath) {
      // The part is kept either way; if joining fails here, the duet shows "Try again".
      row = await startJoin(db, await duetMakeDeps(db, env, row.starterId, row.genre, row.language), row).catch((err) => {
        console.error(`duet ${row.id} join failed:`, (err as Error).message);
        return row;
      });
    }
    if (role === "b") notify(db, [row.starterId], { title: `${row.partnerName} sang their part`, body: `“${row.topic}” · joining it into one song now`, path: `/duets/${row.id}` });
    return NextResponse.json(duetView(row, role, await songStatusOf(db, row), env.BETTER_AUTH_URL));
  } catch (err) {
    return duetErrorResponse(err);
  }
}
