import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { fileStream, serveFile } from "@/lib/serve-file";

const dir = mkdtempSync(path.join(tmpdir(), "serve-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const file = path.join(dir, "reel.mp4");
const data = Buffer.alloc(3 * 1024 * 1024, 7);
writeFileSync(file, data);

describe("serving reel files", () => {
  it("sends the whole file, or the byte range a player asks for", async () => {
    const all = await serveFile(new Request("http://x/v"), file, { "Content-Type": "video/mp4" });
    expect(all.status).toBe(200);
    expect((await all.arrayBuffer()).byteLength).toBe(data.length);
    const part = await serveFile(new Request("http://x/v", { headers: { range: "bytes=10-19" } }), file, {});
    expect(part.status).toBe(206);
    expect(part.headers.get("Content-Range")).toBe(`bytes 10-19/${data.length}`);
    expect((await part.arrayBuffer()).byteLength).toBe(10);
  });

  it("stops cleanly when the player cancels mid-download, with no stray errors", async () => {
    const errors: unknown[] = [];
    const onError = (e: unknown) => errors.push(e);
    process.on("uncaughtException", onError);
    try {
      for (let i = 0; i < 5; i++) {
        const reader = fileStream(file).getReader();
        await reader.read();
        await reader.cancel();
      }
      await new Promise((r) => setTimeout(r, 200));
    } finally {
      process.off("uncaughtException", onError);
    }
    expect(errors).toEqual([]);
  });
});
