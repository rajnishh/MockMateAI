import { getDb } from "@/lib/db";
import { duetByToken, phaseOf } from "@/lib/duets";
import { serveFile } from "@/lib/serve-file";

// The first part, for anyone with the invite link while it's open, so they can hear it before joining.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const d = await duetByToken(getDb(), (await params).token);
  if (!d?.partAPath || phaseOf(d, null) !== "waiting") return new Response("Not found", { status: 404 });
  // The path was written by the server, never taken from the request.
  return serveFile(req, d.partAPath, { "Content-Type": "audio/mpeg", "Cache-Control": "private, no-store" });
}
