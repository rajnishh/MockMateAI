import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

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

// Streams a file the server wrote, with byte ranges so players can seek (iOS needs them to play
// MP4 over HTTP at all). Never pass a path taken from the request.
export async function serveFile(req: Request, file: string, headers: Record<string, string>): Promise<Response> {
  const { size } = await stat(file);
  const range = parseRange(req.headers.get("range"), size);
  const base = { ...headers, "Accept-Ranges": "bytes" };
  if (range === "invalid") return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${size}` } });
  if (!range) {
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers: { ...base, "Content-Length": String(size) } });
  }
  return new Response(Readable.toWeb(createReadStream(file, { start: range.start, end: range.end })) as ReadableStream, {
    status: 206,
    headers: { ...base, "Content-Length": String(range.end - range.start + 1), "Content-Range": `bytes ${range.start}-${range.end}/${size}` },
  });
}
