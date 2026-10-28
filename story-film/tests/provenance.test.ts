import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { C2paSigner, readProvenance, trySign } from "@/lib/provenance";

const dir = mkdtempSync(path.join(tmpdir(), "c2pa-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let signer: C2paSigner;
const info = { title: "Test", description: "AI-generated test" };

function ffmpeg(...args: string[]) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args]);
}

beforeAll(() => {
  execFileSync("bash", ["scripts/dev-c2pa-cert.sh", path.join(dir, "certs")], { stdio: "ignore" });
  signer = new C2paSigner(readFileSync(path.join(dir, "certs/chain.pem")), readFileSync(path.join(dir, "certs/signer.pkcs8.key")));
}, 30_000);

describe("C2PA Content Credentials", () => {
  it("marks a video as AI-generated and keeps it playable", async () => {
    const file = path.join(dir, "film.mp4");
    ffmpeg("-f", "lavfi", "-i", "testsrc=size=320x568:rate=24:duration=2", "-f", "lavfi", "-i", "sine=duration=2", "-shortest", "-pix_fmt", "yuv420p", file);
    const before = statSync(file).size;

    expect(await signer.sign(file, info)).toBe(true);

    expect(statSync(file).size).toBeGreaterThan(before);
    execFileSync("ffmpeg", ["-v", "error", "-i", file, "-f", "null", "-"]);
    const summary = await readProvenance(file);
    expect(summary).toMatchObject({ aiGenerated: true, generator: "Story to Film", issuer: "Story to Film (development)" });
    // A development certificate isn't on the C2PA trust list; nothing else is wrong.
    expect(summary!.issues).toEqual(["signingCredential.untrusted"]);
  }, 30_000);

  it("detects tampering with the signed video", async () => {
    const file = path.join(dir, "tamper.mp4");
    ffmpeg("-f", "lavfi", "-i", "testsrc=size=320x568:rate=24:duration=2", "-pix_fmt", "yuv420p", file);
    await signer.sign(file, info);
    const bytes = readFileSync(file);
    // Flip a byte near the end, inside the media data.
    bytes[bytes.length - 100] ^= 0xff;
    writeFileSync(file, bytes);
    const summary = await readProvenance(file);
    expect(summary!.issues.some((c) => c.includes("mismatch"))).toBe(true);
  }, 30_000);

  it("signs songs (mp3 and wav)", async () => {
    for (const ext of ["mp3", "wav"]) {
      const file = path.join(dir, `song.${ext}`);
      ffmpeg("-f", "lavfi", "-i", "sine=frequency=440:duration=2", file);
      expect(await signer.sign(file, info)).toBe(true);
      expect((await readProvenance(file))?.aiGenerated).toBe(true);
    }
  }, 30_000);

  it("skips unsupported formats and never throws from trySign", async () => {
    const txt = path.join(dir, "note.txt");
    writeFileSync(txt, "hi");
    expect(await signer.sign(txt, info)).toBe(false);
    expect(await trySign(undefined, txt, info)).toBe(false);
    const broken = { sign: async () => { throw new Error("bad key"); } };
    expect(await trySign(broken, txt, info)).toBe(false);
  });
});
