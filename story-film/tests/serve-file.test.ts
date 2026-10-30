import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { previewArgs } from "@/lib/edit/preview";
import { sampleFaces } from "@/lib/edit/vision";
import { parseRange, serveFile } from "@/lib/serve-file";

const dir = mkdtempSync(path.join(tmpdir(), "serve-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("serving videos with byte ranges", () => {
  it("parses the ranges players send", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("bytes=0-", 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
    expect(parseRange("bytes=90-500", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=200-", 100)).toBe("invalid");
    expect(parseRange("items=0-1", 100)).toBeNull();
  });

  it("answers a range with 206 and just those bytes", async () => {
    const file = path.join(dir, "v.mp4");
    writeFileSync(file, Buffer.from("0123456789"));
    const whole = await serveFile(new Request("http://x/"), file, { "Content-Type": "video/mp4" });
    expect(whole.status).toBe(200);
    expect(whole.headers.get("accept-ranges")).toBe("bytes");
    expect(await whole.text()).toBe("0123456789");
    const part = await serveFile(new Request("http://x/", { headers: { range: "bytes=2-5" } }), file, {});
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await part.text()).toBe("2345");
    expect((await serveFile(new Request("http://x/", { headers: { range: "bytes=50-" } }), file, {})).status).toBe(416);
  });
});

describe("editing preview", () => {
  it("makes a small 9:16 H.264 copy that seeks quickly", () => {
    const args = previewArgs("in.mov", "out.mp4").join(" ");
    expect(args).toContain("crop=540:960");
    expect(args).toContain("-g 15");
    expect(args).toContain("+faststart");
  });

  it("sends the face position 10 times a second", () => {
    const faces = Array.from({ length: 90 }, (_, i) => [i, 0, 0, 0] as [number, number, number, number]);
    const sampled = sampleFaces(faces, 30, 10);
    expect(sampled).toHaveLength(30);
    expect(sampled[1]?.[0]).toBe(3);
  });
});
