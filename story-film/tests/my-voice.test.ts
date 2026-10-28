import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { FalQueueClient } from "@/lib/providers/fal";
import { FalChatterboxVc, FalDemucs, SeedVcServer } from "@/lib/providers/voice";
import { consentStatement, newConsentCode, spokenDigits, transcriptHasCode } from "@/lib/voice/consent";
import { deleteVoice, getVoice, listVoices, saveVoice } from "@/lib/voice/profiles";
import { buildMixArgs, singInMyVoice } from "@/lib/voice/sing";
import { testDb } from "./helpers/db";

const dir = mkdtempSync(path.join(tmpdir(), "voice-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function tone(file: string, freq: number, sec = 3) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `sine=frequency=${freq}:duration=${sec}`, file]);
}

describe("spoken consent code", () => {
  it("makes 4-digit codes and puts them in the statement", () => {
    const code = newConsentCode();
    expect(code).toMatch(/^[1-9]{4}$/);
    expect(consentStatement("4821")).toContain("My code is 4 8 2 1.");
  });

  it("recognises the code however Whisper writes it", () => {
    expect(transcriptHasCode("...my code is 4821.", "4821")).toBe(true);
    expect(transcriptHasCode("My code is four, eight, two, one.", "4821")).toBe(true);
    expect(transcriptHasCode("मेरा कोड है चार आठ दो एक", "4821")).toBe(true);
    expect(transcriptHasCode("कोड ४८२१", "4821")).toBe(true);
    expect(transcriptHasCode("my code is chaar aath do ek", "4821")).toBe(true);
    expect(transcriptHasCode("My code is 4 8 2 2", "4821")).toBe(false);
    expect(transcriptHasCode("a celebrity interview clip", "4821")).toBe(false);
    expect(spokenDigits("Twelve")).toBe("");
  });
});

function fakeFal(output: unknown) {
  const bodies: Record<string, unknown>[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    if (url.startsWith("https://queue.fal.run/")) {
      bodies.push(JSON.parse(init!.body as string));
      return Response.json({ request_id: "r", status_url: "s", response_url: "o" });
    }
    if (url === "s") return Response.json({ status: "COMPLETED" });
    return Response.json(output);
  }) as unknown as typeof fetch;
  return { client: new FalQueueClient("k", fetchFn, 0), bodies };
}

describe("separation and conversion clients", () => {
  it("Demucs returns vocals and backing stems", async () => {
    const { client, bodies } = fakeFal({ vocals: { url: "https://v" }, drums: { url: "https://d" }, bass: null, other: { url: "https://o" } });
    const stems = await new FalDemucs(client).separate("data:audio/mpeg;base64,AA==");
    expect(bodies[0]).toMatchObject({ model: "htdemucs", stems: ["vocals", "drums", "bass", "other"] });
    expect(stems).toEqual({ vocalsUrl: "https://v", accompanimentUrls: ["https://d", "https://o"] });
  });

  it("Chatterbox converts the vocals to the reference voice", async () => {
    const { client, bodies } = fakeFal({ audio: { url: "https://converted" } });
    const out = await new FalChatterboxVc(client).convert({ sourceUrl: "https://v", referenceDataUri: "data:audio/mpeg;base64,AA==" });
    expect(bodies[0]).toEqual({ source_audio_url: "https://v", target_voice_audio_url: "data:audio/mpeg;base64,AA==" });
    expect(out).toEqual({ url: "https://converted" });
  });

  it("Seed-VC keeps the melody (f0 conditioning)", async () => {
    let body: Record<string, unknown> = {};
    const fetchFn = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return new Response(Buffer.from("wav"));
    }) as unknown as typeof fetch;
    const out = await new SeedVcServer("http://svc", fetchFn).convert({ sourceUrl: "https://v", referenceDataUri: "data:audio/mpeg;base64,QUJD" });
    expect(body).toMatchObject({ source_url: "https://v", reference_audio_base64: "QUJD", f0_condition: true });
    expect("data" in out && out.data.toString()).toBe("wav");
  });
});

describe("re-singing a song", () => {
  it("mixes converted vocals over the backing stems", () => {
    const args = buildMixArgs("v.wav", ["d.wav", "o.wav"], "out.mp3");
    expect(args.join(" ")).toContain("[0:a][1:a][2:a]amix=inputs=3:duration=longest:normalize=0,alimiter=limit=0.95[out]");
  });

  it("runs end to end with real audio files", async () => {
    const song = path.join(dir, "song.wav");
    const sample = path.join(dir, "me.wav");
    const vocals = path.join(dir, "vocals.wav");
    const drums = path.join(dir, "drums.wav");
    tone(song, 440);
    tone(sample, 200);
    tone(vocals, 300);
    tone(drums, 100);
    let reference = "";
    const out = await singInMyVoice(
      {
        separator: { modelId: "demucs", separate: async (uri) => {
          expect(uri.startsWith("data:audio/mpeg;base64,")).toBe(true);
          return { vocalsUrl: `file://${vocals}`, accompanimentUrls: [`file://${drums}`] };
        } },
        converter: { modelId: "chatterbox", convert: async (i) => {
          reference = i.referenceDataUri;
          return { data: readFileSync(vocals) };
        } },
      },
      song,
      sample,
      path.join(dir, "work"),
    );
    expect(reference.startsWith("data:audio/mpeg;base64,")).toBe(true);
    const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_name", "-of", "default=nw=1", out]).toString();
    expect(probe).toContain("codec_name=mp3");
    expect(Number(/duration=([\d.]+)/.exec(probe)![1])).toBeCloseTo(3, 0);
  }, 60_000);
});

describe("voice profiles", () => {
  let db: Db;
  beforeAll(async () => {
    db = await testDb();
    const now = new Date();
    await db.insert(user).values([
      { id: "u1", name: "One", email: "one@example.com", createdAt: now, updatedAt: now },
      { id: "u2", name: "Two", email: "two@example.com", createdAt: now, updatedAt: now },
    ]);
  }, 30_000);

  it("are private to their owner and deleting erases the recording", async () => {
    const sample = path.join(dir, "sample.wav");
    writeFileSync(sample, "wav");
    const v = await saveVoice(db, {
      userId: "u1",
      name: "Me",
      samplePath: sample,
      durationSec: 20,
      consentText: consentStatement("4821"),
      consentCode: "4821",
      transcript: "This is my own voice ... 4 8 2 1",
    });
    expect(await getVoice(db, "u2", v.id)).toBeUndefined();
    expect(await deleteVoice(db, "u2", v.id)).toBe(false);
    expect(existsSync(sample)).toBe(true);
    expect(await deleteVoice(db, "u1", v.id)).toBe(true);
    expect(existsSync(sample)).toBe(false);
    expect(await listVoices(db, "u1")).toEqual([]);
  });
});
