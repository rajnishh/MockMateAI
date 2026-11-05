import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { AceStepMusic } from "@/lib/providers/acestep";
import { buildShortSongProvider, buildSongEditor, buildSongProvider, songsAvailable } from "@/lib/providers";
import { FalLyria } from "@/lib/providers/fal-music";
import type { Env } from "@/lib/env";

const mp3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(16)]);

// A fake ACE-Step 1.5 server: one poll still running, then done.
function fakeServer(finalStatus = 1) {
  const calls: { url: string; body?: unknown }[] = [];
  let polls = 0;
  const fetchFn = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body instanceof FormData ? Object.fromEntries(init.body.entries()) : init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, body });
    if (url.endsWith("/release_task")) return Response.json({ data: { task_id: "t1", status: "queued" }, code: 200, error: null });
    if (url.endsWith("/query_result")) {
      polls++;
      const status = polls < 2 ? 0 : finalStatus;
      const result = status === 1 ? JSON.stringify([{ file: "/v1/audio?path=%2Ftmp%2Fa.mp3", status: 1 }]) : status === 2 ? "out of memory" : undefined;
      return Response.json({ data: [{ task_id: "t1", status, result }], code: 200, error: null });
    }
    if (url === "http://ace.test/v1/audio?path=%2Ftmp%2Fa.mp3") return new Response(mp3);
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;
  return { calls, ace: new AceStepMusic("http://ace.test", fetchFn, 0) };
}

describe("AceStepMusic (self-hosted ACE-Step 1.5)", () => {
  it("sings a song: submits a task, polls it and downloads the audio", async () => {
    const { calls, ace } = fakeServer();
    const audio = await ace.sing({ style: "bollywood pop", lyrics: "[Verse]\nchai", durationSec: 60, vocalLanguage: "hi" });

    expect(audio).toEqual({ data: mp3, ext: "mp3" });
    expect(calls[0].body).toMatchObject({ prompt: "bollywood pop", lyrics: "[Verse]\nchai", audio_duration: 60, vocal_language: "hi", batch_size: 1, audio_format: "mp3" });
    expect(calls.filter((c) => c.url.endsWith("/query_result"))).toHaveLength(2);
  });

  it("leaves the language out when it is unknown, so the model detects it", async () => {
    const { calls, ace } = fakeServer();
    await ace.sing({ style: "pop", lyrics: "la", durationSec: 30, vocalLanguage: "unknown" });
    expect(calls[0].body).not.toHaveProperty("vocal_language");
  });

  it("redoes one part of a local song by uploading it", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ace-"));
    const file = path.join(dir, "song.mp3");
    await writeFile(file, mp3);
    const { calls, ace } = fakeServer();
    await ace.replaceSection({ audioUrl: pathToFileURL(file).href, startSec: 10, endSec: 20, style: "sufi" });

    const body = calls[0].body as Record<string, unknown>;
    expect(body).toMatchObject({ task_type: "repaint", repainting_start: "10", repainting_end: "20", chunk_mask_mode: "explicit" });
    expect(body.src_audio).toBeInstanceOf(Blob);
  });

  it("surfaces a failed task", async () => {
    const { ace } = fakeServer(2);
    await expect(ace.compose({ prompt: "calm", durationSec: 20 })).rejects.toThrow(/out of memory/);
  });
});

describe("song providers", () => {
  const env = (e: Partial<Env>) => e as Env;

  it("uses the local server for songs and remix when ACESTEP_URL is set", () => {
    const e = env({ ACESTEP_URL: "http://localhost:8001", FAL_KEY: "k" });
    expect(songsAvailable(e)).toBe(true);
    expect(buildSongProvider(e)).toBeInstanceOf(AceStepMusic);
    expect(buildSongEditor(e)).toBeInstanceOf(AceStepMusic);
    expect(buildShortSongProvider(e)).toBeInstanceOf(FalLyria);
  });

  it("works with no fal key at all", () => {
    const e = env({ ACESTEP_URL: "http://localhost:8001" });
    expect(songsAvailable(e)).toBe(true);
    expect(buildShortSongProvider(e)).toBeInstanceOf(AceStepMusic);
  });
});
