import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { getFilmQueue } from "@/lib/queue/films";
import { getUserId } from "@/lib/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getFilmQueue().getJob(id);
  if (!job || job.data.userId !== (await getUserId(false)) || !job.returnvalue?.output) {
    return new Response("Not found", { status: 404 });
  }
  // Output path comes from the worker's return value, never from the request.
  const file: string = job.returnvalue.output;
  const { size } = await stat(file);
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="film-${id}.mp4"`,
    },
  });
}
