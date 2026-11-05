import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { REMIX_CREDITS } from "@/lib/billing/catalog";
import { defaultFfmpeg, probeDuration } from "@/lib/ffmpeg";
import { proRemixAvailable } from "@/lib/providers";
import { FalQueueClient } from "@/lib/providers/fal";
import { FalSongEditor } from "@/lib/providers/fal-song-edit";
import { RUNWARE_ACE_STEP, RUNWARE_API, runwareStrength, RunwareSongEditor } from "@/lib/providers/runware-song-edit";
import { ADD_PART_PROMPT, ADD_PART_STRENGTH, EXTEND_BLEND_SEC, EXTEND_CUT_SEC, remixCall, remixKinds, remixRequestSchema, runRemix } from "@/lib/songs/remix";
import { loadEnv } from "@/lib/env";

type Task = Record<string, unknown> & { taskType: string; taskUUID: string };

// A fake Runware API plus CDN: async tasks answer "processing" once, then succeed.
function fakeRunware(outBytes = Buffer.from("ID3-runware-mp3")) {
  const tasks: Task[] = [];
  const polls = new Map<string, number>();
  const fetchFn = (async (url: string, init?: RequestInit) => {
    if (url === "https://cdn.test/runware/out.mp3") return new Response(outBytes);
    if (url !== RUNWARE_API) throw new Error(`unexpected fetch ${url}`);
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer rk");
    const [task] = JSON.parse(init!.body as string) as Task[];
    tasks.push(task);
    if (task.taskType === "mediaStorage") return Response.json({ data: [{ taskType: "mediaStorage", taskUUID: task.taskUUID, mediaUUID: "media-1" }] });
    if (task.taskType === "audioInference") return Response.json({ data: [{ taskType: "audioInference", taskUUID: task.taskUUID }] });
    const n = (polls.get(task.taskUUID) ?? 0) + 1;
    polls.set(task.taskUUID, n);
    return Response.json({
      data: [n === 1 ? { taskType: "audioInference", taskUUID: task.taskUUID, status: "processing" } : { taskType: "audioInference", taskUUID: task.taskUUID, status: "success", audioURL: "https://cdn.test/runware/out.mp3", cost: 0.006 }],
    });
  }) as unknown as typeof fetch;
  return { tasks, fetchFn, editor: new RunwareSongEditor("rk", fetchFn, 0) };
}

const inference = (tasks: Task[]) => tasks.filter((t) => t.taskType === "audioInference");

describe("RunwareSongEditor (ACE-Step 1.5)", () => {
  it("covers a song with a strength, waiting for the async task", async () => {
    const { tasks, editor } = fakeRunware();
    const audio = await editor.cover({ audioUrl: "https://cdn.test/song.mp3", style: "sufi rock", lyrics: "[Verse]\nbaarish aayi", strength: 0.8 });

    const [task] = inference(tasks);
    expect(task).toMatchObject({
      model: RUNWARE_ACE_STEP,
      deliveryMethod: "async",
      outputFormat: "MP3",
      positivePrompt: "sufi rock",
      inputs: { audio: "https://cdn.test/song.mp3" },
      settings: { lyrics: "[Verse]\nbaarish aayi" },
      strength: runwareStrength(0.8),
    });
    expect(tasks.filter((t) => t.taskType === "getResponse" && t.taskUUID === task.taskUUID)).toHaveLength(2);
    expect(audio).toEqual({ data: Buffer.from("ID3-runware-mp3"), ext: "mp3" });
  });

  it("turns 'how far from the original' into Runware's share of steps that follow it", () => {
    expect(runwareStrength(0)).toBe(0.9);
    expect(runwareStrength(1)).toBe(0.2);
    expect(runwareStrength(0.5)).toBeCloseTo(0.55);
    expect(runwareStrength(7)).toBe(0.2);
  });

  it("repaints a part, leaving out lyrics Runware would reject as too short", async () => {
    const { tasks, editor } = fakeRunware();
    await editor.repaint({ audioUrl: "https://cdn.test/song.mp3", style: "pop", lyrics: "la", startSec: 12, endSec: 999 });
    const [task] = inference(tasks);
    expect(task.settings).toEqual({ repaintingStart: 12, repaintingEnd: 300 });
    expect(task.strength).toBeUndefined();
  });

  it("uploads a local song to Runware's media storage and sends it by id", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "runware-"));
    const file = path.join(dir, "song.wav");
    const flac = Buffer.concat([Buffer.from("fLaC"), Buffer.alloc(8)]);
    await writeFile(file, flac);
    const { tasks, editor } = fakeRunware();
    await editor.cover({ audioUrl: pathToFileURL(file).href, style: "lo-fi" });

    expect(tasks[0]).toMatchObject({ taskType: "mediaStorage", operation: "upload", media: `data:audio/flac;base64,${flac.toString("base64")}` });
    expect(inference(tasks)[0].inputs).toEqual({ audio: "media-1" });
  });

  it("surfaces Runware errors", async () => {
    const fetchFn = (async () => Response.json({ errors: [{ code: "insufficientCredits", message: "Top up" }] }, { status: 402 })) as unknown as typeof fetch;
    await expect(new RunwareSongEditor("rk", fetchFn, 0).cover({ audioUrl: "https://cdn.test/a.mp3", style: "pop" })).rejects.toThrow(/Runware 402: insufficientCredits Top up/);
  });

  it("fails when a task fails", async () => {
    const fetchFn = (async (_: string, init?: RequestInit) => {
      const [task] = JSON.parse(init!.body as string) as Task[];
      return Response.json({ data: [{ taskType: "audioInference", taskUUID: task.taskUUID, status: task.taskType === "getResponse" ? "error" : undefined }] });
    }) as unknown as typeof fetch;
    await expect(new RunwareSongEditor("rk", fetchFn, 0).cover({ audioUrl: "https://cdn.test/a.mp3", style: "pop" })).rejects.toThrow(/failed/);
  });
});

describe("pro remix kinds", () => {
  const song = { audioUrl: "https://cdn.test/song.mp3", style: "bollywood pop", lyrics: "[Verse]\nbaarish", durationSec: 60 };

  it("lists Add vocals and Add instrumental only when Runware is set up", () => {
    expect(remixKinds(false)).toEqual(["cover", "extend", "replace"]);
    expect(remixKinds(true)).toEqual(["cover", "extend", "replace", "add-vocals", "add-instrumental"]);
    const env = loadEnv();
    expect(proRemixAvailable({ ...env, FAL_KEY: "f", RUNWARE_API_KEY: undefined })).toBe(false);
    expect(proRemixAvailable({ ...env, FAL_KEY: "f", RUNWARE_API_KEY: "r" })).toBe(true);
  });

  it("validates the new kinds", () => {
    expect(remixRequestSchema.safeParse({ kind: "cover", style: "rock", strength: 0.7 }).success).toBe(true);
    expect(remixRequestSchema.safeParse({ kind: "cover", style: "rock", strength: 1.5 }).success).toBe(false);
    expect(remixRequestSchema.safeParse({ kind: "add-vocals" }).success).toBe(false);
    expect(remixRequestSchema.safeParse({ kind: "add-vocals", lyrics: "[Verse]\nnaya gaana" }).success).toBe(true);
    expect(remixRequestSchema.safeParse({ kind: "add-instrumental" }).success).toBe(true);
  });

  it("passes the cover strength through, and prices the new kinds", () => {
    expect(remixCall({ kind: "cover", style: "rock", strength: 0.2 }, song).input).toMatchObject({ strength: 0.2 });
    expect(remixCall({ kind: "cover", style: "rock" }, song).input).not.toHaveProperty("strength");
    expect(remixCall({ kind: "add-instrumental" }, song)).toEqual({ kind: "add-instrumental", input: { audioUrl: song.audioUrl, style: song.style, lyrics: song.lyrics } });
    expect(REMIX_CREDITS["add-vocals"]).toBeGreaterThan(REMIX_CREDITS.cover);
  });

  it("runs covers and replaced parts on Runware when it's set up, else on fal", async () => {
    const { tasks, editor: pro } = fakeRunware();
    const falCalls: string[] = [];
    const falFetch = (async (url: string) => {
      falCalls.push(url);
      return Response.json({ request_id: "r", status_url: "s", response_url: "o" });
    }) as unknown as typeof fetch;
    const fal = new FalSongEditor(new FalQueueClient("k", falFetch, 0), falFetch);
    const tools = { workDir: os.tmpdir(), ffmpeg: defaultFfmpeg, probeDuration, pro };

    await runRemix(fal, remixCall({ kind: "cover", style: "rock", strength: 1 }, song), tools);
    await runRemix(fal, remixCall({ kind: "replace", startSec: 5, endSec: 15 }, song), tools);
    expect(inference(tasks).map((t) => [t.strength, t.settings])).toEqual([
      [0.2, { lyrics: song.lyrics }],
      [undefined, { lyrics: song.lyrics, repaintingStart: 5, repaintingEnd: 15 }],
    ]);
    expect(falCalls).toEqual([]);
    await expect(runRemix(fal, remixCall({ kind: "add-vocals", lyrics: "[Verse]\nnaya gaana" }, song), { ...tools, pro: undefined })).rejects.toThrow(/Runware/);
  });

  it("extends on Runware by repainting past the end, from just before the fade-out", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "remix-pro-"));
    const source = path.join(dir, "song.mp3");
    await defaultFfmpeg(["-y", "-f", "lavfi", "-i", "sine=frequency=330:duration=20", "-c:a", "libmp3lame", source]);
    const { tasks, editor: pro } = fakeRunware();
    await runRemix({} as FalSongEditor, remixCall({ kind: "extend", extendSec: 30 }, { ...song, audioUrl: pathToFileURL(source).href }), { workDir: dir, ffmpeg: defaultFfmpeg, probeDuration, pro });

    const settings = inference(tasks)[0].settings as Record<string, number>;
    expect(settings.repaintingStart).toBeCloseTo(20 - EXTEND_CUT_SEC - EXTEND_BLEND_SEC, 1);
    expect(settings.repaintingEnd).toBeCloseTo(50, 1);
  });

  // A fake Demucs that hands out the original's stems first, then the cover's, so the test sees which went into the mix.
  async function addPartRun(kind: "add-vocals" | "add-instrumental") {
    const dir = await mkdtemp(path.join(os.tmpdir(), "remix-add-"));
    const source = path.join(dir, "song.mp3");
    await defaultFfmpeg(["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=330:duration=3", "-c:a", "libmp3lame", source]);
    const tone = async (name: string, hz: number) => {
      const f = path.join(dir, name);
      await defaultFfmpeg(["-y", "-loglevel", "error", "-f", "lavfi", "-i", `sine=frequency=${hz}:duration=3`, f]);
      return f;
    };
    const stemFiles: Record<string, string> = {
      "https://cdn.test/orig/vocals.wav": await tone("ov.wav", 440),
      "https://cdn.test/orig/drums.wav": await tone("od.wav", 220),
      "https://cdn.test/cover/vocals.wav": await tone("cv.wav", 880),
      "https://cdn.test/cover/drums.wav": await tone("cd.wav", 110),
    };
    const { tasks, fetchFn: runwareFetch, editor: pro } = fakeRunware(await readFile(source));
    const fetched: string[] = [];
    const fetchFn = (async (url: string, init?: RequestInit) => {
      if (stemFiles[url]) {
        fetched.push(url);
        return new Response(await readFile(stemFiles[url]));
      }
      return runwareFetch(url, init);
    }) as unknown as typeof fetch;
    const separated: string[] = [];
    let n = 0;
    const separator = {
      async separate(uri: string) {
        separated.push(uri.slice(0, 23));
        // The original is split first (it starts at once), then the cover.
        const who = n++ === 0 ? "orig" : "cover";
        return { vocalsUrl: `https://cdn.test/${who}/vocals.wav`, accompanimentUrls: [`https://cdn.test/${who}/drums.wav`] };
      },
    };
    const mixes: string[][] = [];
    const ffmpeg = async (args: string[]) => {
      if (args.includes("-filter_complex")) mixes.push(args.filter((_, i) => args[i - 1] === "-i"));
      return defaultFfmpeg(args);
    };
    const audio = await runRemix(
      {} as FalSongEditor,
      remixCall({ kind, lyrics: "[Verse]\nnaya gaana" }, { ...song, audioUrl: pathToFileURL(source).href }),
      { workDir: dir, ffmpeg, probeDuration, pro, separator, fetchFn },
    );
    return { audio, tasks, separated, mixes, dir, fetched };
  }

  it("adds vocals: the cover's singing over the original's own music", async () => {
    const { audio, tasks, separated, mixes, dir, fetched } = await addPartRun("add-vocals");
    expect(inference(tasks)[0]).toMatchObject({ positivePrompt: `${song.style}, ${ADD_PART_PROMPT["add-vocals"]}`, settings: { lyrics: "[Verse]\nnaya gaana" }, strength: runwareStrength(ADD_PART_STRENGTH) });
    expect(separated).toEqual(["data:audio/mpeg;base64,", "data:audio/mpeg;base64,"]);
    expect(fetched.sort()).toEqual(["https://cdn.test/cover/vocals.wav", "https://cdn.test/orig/drums.wav"]);
    // The mix's inputs are [vocals, ...backing].
    expect(mixes).toHaveLength(1);
    const [vocals, drums] = mixes[0];
    expect(path.basename(vocals)).toBe("vocals-0.wav");
    expect(path.basename(drums)).toBe("backing-0.wav");
    expect(audio.ext).toBe("mp3");
    expect(audio.data.length).toBeGreaterThan(1000);
    // The work folder is cleaned up.
    expect((await readdir(dir)).filter((f) => f.endsWith("-add"))).toEqual([]);
  });

  it("adds an instrumental: the original's vocals over the cover's music", async () => {
    const { tasks, fetched } = await addPartRun("add-instrumental");
    expect(fetched.sort()).toEqual(["https://cdn.test/cover/drums.wav", "https://cdn.test/orig/vocals.wav"]);
    expect(inference(tasks)[0].positivePrompt).toBe(`${song.style}, ${ADD_PART_PROMPT["add-instrumental"]}`);
  });
});
