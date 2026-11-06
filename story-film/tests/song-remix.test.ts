import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { REMIX_CREDITS } from "@/lib/billing/catalog";
import { FalQueueClient } from "@/lib/providers/fal";
import { FAL_ACE_STEP_EDIT, FalSongEditor } from "@/lib/providers/fal-song-edit";
import { defaultFfmpeg, probeDuration } from "@/lib/ffmpeg";
import { EXTEND_BLEND_SEC, EXTEND_CUT_SEC, remixCall, remixCredits, remixedDurationSec, remixRequestSchema, remixSchemaFor, runRemix } from "@/lib/songs/remix";

// A fake fal queue plus CDN: records what was sent and answers every request locally.
function fakeFal(outUrl = "https://cdn.test/out/remix.mp3", outBytes = Buffer.from("remixed-bytes")) {
  const calls: { url: string; body?: Record<string, unknown> }[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : undefined });
    if (url.startsWith("https://queue.fal.run/")) return Response.json({ request_id: "r", status_url: "s", response_url: "o" });
    if (url === "s") return Response.json({ status: "COMPLETED" });
    if (url === "o") return Response.json({ audio: { url: outUrl, content_type: "audio/mpeg" }, seed: 1, tags: "", lyrics: "" });
    if (url === outUrl) return new Response(outBytes);
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;
  const editor = new FalSongEditor(new FalQueueClient("k", fetchFn, 0), fetchFn);
  return { calls, editor };
}

const tools = (workDir: string) => ({ workDir, ffmpeg: defaultFfmpeg, probeDuration });

const song = { audioUrl: "https://cdn.test/song.mp3", style: "bollywood pop, female vocals", lyrics: "[Verse]\nbaarish", durationSec: 60 };

describe("FalSongEditor", () => {
  it("covers a song in a new style, keeping its lyrics", async () => {
    const { calls, editor } = fakeFal();
    const audio = await editor.cover({ audioUrl: song.audioUrl, style: "sufi rock", originalStyle: song.style, originalLyrics: song.lyrics });

    expect(calls[0].url).toBe(`https://queue.fal.run/${FAL_ACE_STEP_EDIT.cover}`);
    expect(calls[0].body).toEqual({
      audio_url: song.audioUrl,
      edit_mode: "remix",
      tags: "sufi rock",
      original_tags: song.style,
      lyrics: song.lyrics,
      original_lyrics: song.lyrics,
    });
    expect(audio).toEqual({ data: Buffer.from("remixed-bytes"), ext: "mp3" });
  });

  it("extends a song within fal's limits", async () => {
    const { calls, editor } = fakeFal();
    await editor.extend({ audioUrl: song.audioUrl, style: "pop", lyrics: "la la", extendBeforeSec: -5, extendAfterSec: 500 });

    expect(calls[0].url).toBe("https://queue.fal.run/fal-ai/ace-step/audio-outpaint");
    expect(calls[0].body).toEqual({ audio_url: song.audioUrl, tags: "pop", lyrics: "la la", extend_before_duration: 0, extend_after_duration: 107 });
  });

  it("replaces one part of a song", async () => {
    const { calls, editor } = fakeFal("https://cdn.test/out/part.wav");
    const audio = await editor.replaceSection({ audioUrl: song.audioUrl, startSec: 12, endSec: 24.5, style: "pop" });

    expect(calls[0].url).toBe("https://queue.fal.run/fal-ai/ace-step/audio-inpaint");
    expect(calls[0].body).toEqual({
      audio_url: song.audioUrl,
      tags: "pop",
      start_time: 12,
      start_time_relative_to: "start",
      end_time: 24.5,
      end_time_relative_to: "start",
    });
    expect(audio.ext).toBe("wav");
  });

  it("sends a locally stored song inline, since fal can't reach it", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "remix-"));
    const file = path.join(dir, "song.mp3");
    await writeFile(file, "local-mp3");
    const { calls, editor } = fakeFal();
    await editor.replaceSection({ audioUrl: pathToFileURL(file).href, startSec: 0, endSec: 10, style: "pop" });

    expect(calls[0].body!.audio_url).toBe(`data:audio/mpeg;base64,${Buffer.from("local-mp3").toString("base64")}`);
  });

  it("types a local song by its contents: FLAC saved as .wav goes to fal as FLAC", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "remix-"));
    const file = path.join(dir, "song.wav");
    const flac = Buffer.concat([Buffer.from("fLaC"), Buffer.alloc(8)]);
    await writeFile(file, flac);
    const { calls, editor } = fakeFal();
    await editor.replaceSection({ audioUrl: pathToFileURL(file).href, startSec: 0, endSec: 10, style: "pop" });

    expect(calls[0].body!.audio_url).toBe(`data:audio/flac;base64,${flac.toString("base64")}`);
  });

  it("names fal's output by its contents, not its file name", async () => {
    const { editor } = fakeFal("https://cdn.test/out/part.wav", Buffer.concat([Buffer.from("fLaC"), Buffer.alloc(8)]));
    const audio = await editor.replaceSection({ audioUrl: song.audioUrl, startSec: 0, endSec: 10, style: "pop" });
    expect(audio.ext).toBe("flac");
  });

  it("surfaces fal errors", async () => {
    const fetchFn = (async () => new Response("bad audio", { status: 422 })) as unknown as typeof fetch;
    const editor = new FalSongEditor(new FalQueueClient("k", fetchFn, 0), fetchFn);
    await expect(editor.cover({ audioUrl: song.audioUrl, style: "rock", originalStyle: "pop", originalLyrics: "x" })).rejects.toThrow(/fal 422/);
  });
});

describe("remix requests", () => {
  it("accepts each kind of remix", () => {
    expect(remixRequestSchema.safeParse({ kind: "cover", style: "sufi rock" }).success).toBe(true);
    expect(remixRequestSchema.safeParse({ kind: "extend" }).success).toBe(true);
    expect(remixRequestSchema.safeParse({ kind: "replace", startSec: 10, endSec: 20 }).success).toBe(true);
  });

  it("rejects incomplete or out-of-range requests", () => {
    const issue = (body: unknown, len = 60) => {
      const r = remixSchemaFor(len).safeParse(body);
      return r.success ? undefined : r.error.issues[0].path.join(".");
    };
    expect(issue({ kind: "remaster" })).toBe("kind");
    expect(issue({ kind: "cover" })).toBe("style");
    expect(issue({ kind: "cover", style: "  " })).toBe("style");
    expect(issue({ kind: "replace", startSec: 10 })).toBe("startSec");
    expect(issue({ kind: "replace", startSec: 10, endSec: 11 })).toBe("endSec");
    expect(issue({ kind: "replace", startSec: 10, endSec: 90 })).toBe("endSec");
    expect(issue({ kind: "replace", startSec: 50, endSec: 70 })).toBe("endSec");
    expect(issue({ kind: "extend", extendSec: 5 })).toBe("extendSec");
    expect(issue({ kind: "extend", extendSec: 61 })).toBe("extendSec");
    expect(issue({ kind: "extend", extendSec: 15.5 })).toBe("extendSec");
    expect(issue({ kind: "extend", extendSec: 60 }, 200)).toBe("extendSec");
    expect(issue({ kind: "cover", style: "rock" }, 300)).toBe("kind");
    expect(issue({ kind: "replace", startSec: 50, endSec: 60 })).toBeUndefined();
    expect(issue({ kind: "extend", extendSec: 60 }, 180)).toBeUndefined();
  });

  it("maps a request onto the editor, falling back to the song's style and lyrics", () => {
    expect(remixCall({ kind: "cover", style: "sufi rock" }, song)).toEqual({
      kind: "cover",
      input: { audioUrl: song.audioUrl, style: "sufi rock", originalStyle: song.style, lyrics: song.lyrics, originalLyrics: song.lyrics },
    });
    expect(remixCall({ kind: "extend" }, song)).toEqual({
      kind: "extend",
      input: { audioUrl: song.audioUrl, style: song.style, lyrics: song.lyrics, extendSec: 30 },
    });
    expect(remixCall({ kind: "replace", startSec: 5, endSec: 15, lyrics: "[Verse]\nnaya" }, song)).toEqual({
      kind: "replace",
      input: { audioUrl: song.audioUrl, style: song.style, lyrics: "[Verse]\nnaya", startSec: 5, endSec: 15 },
    });
  });

  it("runs the mapped call on the right endpoint", async () => {
    const { calls, editor } = fakeFal();
    await runRemix(editor, remixCall({ kind: "replace", startSec: 5, endSec: 15 }, song), tools(os.tmpdir()));
    expect(calls[0].url).toBe("https://queue.fal.run/fal-ai/ace-step/audio-inpaint");
  });

  it("extends by repainting a copy of the ending, so the original part stays as it was", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "remix-extend-"));
    const source = path.join(dir, "song.mp3");
    await defaultFfmpeg(["-y", "-f", "lavfi", "-i", "sine=frequency=330:duration=20", "-c:a", "libmp3lame", source]);
    const { calls, editor } = fakeFal();

    await runRemix(editor, remixCall({ kind: "extend", extendSec: 30 }, { ...song, audioUrl: pathToFileURL(source).href, durationSec: 20 }), tools(dir));

    const body = calls[0].body!;
    expect(calls[0].url).toBe("https://queue.fal.run/fal-ai/ace-step/audio-inpaint");
    expect(body.start_time).toBeCloseTo(20 - EXTEND_CUT_SEC - EXTEND_BLEND_SEC, 1);
    expect(body.end_time).toBeCloseTo(50, 1);
    // The lengthened song sent to fal: 15s of the song (its last 5s dropped) plus 35s looped from before the cut.
    const sent = path.join(dir, "sent.mp3");
    await writeFile(sent, Buffer.from(String(body.audio_url).split(",")[1], "base64"));
    expect(await probeDuration(sent)).toBeCloseTo(50, 0);
    // The temporary copy is cleaned up.
    expect((await readdir(dir)).sort()).toEqual(["sent.mp3", "song.mp3"]);
  });

  it("knows the remixed length", () => {
    expect(remixedDurationSec({ kind: "extend", extendSec: 20 }, 60)).toBe(80);
    expect(remixedDurationSec({ kind: "extend" }, 60)).toBe(90);
    expect(remixedDurationSec({ kind: "cover", style: "rock" }, 60)).toBe(60);
  });

  it("prices a whole-song remix like one ACE-Step take", () => {
    expect(remixCredits("cover")).toBe(REMIX_CREDITS.cover);
    expect([remixCredits("cover"), remixCredits("extend"), remixCredits("replace")]).toEqual([1, 1, 1]);
  });
});
