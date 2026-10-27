import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "@/lib/env";
import { MEDIA_NAME } from "@/lib/media";
import { mediaStore } from "@/lib/providers";
import { getUserId, unauthorized } from "@/lib/session";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", mp4: "video/mp4", wav: "audio/wav" };

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  if (!(await getUserId())) return unauthorized();
  const { name } = await params;
  // Strict name check keeps requests inside the media directory.
  if (!MEDIA_NAME.test(name)) return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(path.join(mediaStore(loadEnv()).dir, name));
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": TYPES[name.split(".").pop()!], "Cache-Control": "private, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
