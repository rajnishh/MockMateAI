import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

// Parses a single "bytes=" range; null when absent or unusable (the whole file is sent).
export function parseRange(header: string | null, size: number): { start: number; end: number } | "invalid" | null {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (!m[1] && !m[2])) return null;
  let start: number;
  let end: number;
  if (!m[1]) {
    // "bytes=-500": the last 500 bytes.
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  }
  if (start >= size || start > end) return "invalid";
  return { start, end };
}

// A file as a web stream that stops reading the moment the player cancels. Node's Readable.toWeb
// keeps pushing into the closed stream when a player gives up mid-download (inline players and
// picture-in-picture do this all the time), which crashed the server with ERR_INVALID_STATE.
export function fileStream(file: string, range?: { start: number; end: number }): ReadableStream<Uint8Array> {
  const node = createReadStream(file, range);
  let done = false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      node.on("data", (chunk) => {
        if (done) return;
        controller.enqueue(new Uint8Array(chunk as Buffer));
        // Read only as fast as the player takes it.
        if ((controller.desiredSize ?? 1) <= 0) node.pause();
      });
      node.on("end", () => {
        if (!done) controller.close();
        done = true;
      });
      node.on("error", (err) => {
        if (!done) controller.error(err);
        done = true;
      });
    },
    pull() {
      node.resume();
    },
    cancel() {
      done = true;
      node.destroy();
    },
  });
}

// Streams a file the server wrote, with byte ranges so players can seek (iOS needs them to play
// MP4 over HTTP at all). Never pass a path taken from the request.
export async function serveFile(req: Request, file: string, headers: Record<string, string>): Promise<Response> {
  const { size } = await stat(file);
  const range = parseRange(req.headers.get("range"), size);
  const base = { ...headers, "Accept-Ranges": "bytes" };
  if (range === "invalid") return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${size}` } });
  if (!range) {
    return new Response(fileStream(file), { headers: { ...base, "Content-Length": String(size) } });
  }
  return new Response(fileStream(file, range), {
    status: 206,
    headers: { ...base, "Content-Length": String(range.end - range.start + 1), "Content-Range": `bytes ${range.start}-${range.end}/${size}` },
  });
}
