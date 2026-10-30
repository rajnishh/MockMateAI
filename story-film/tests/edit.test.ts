import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyEditChanges, loadEditState, renderPlannedEdit, runEditVideo } from "@/lib/edit/pipeline";
import { mixArgs, soundArgs, SOUNDS, voiceFilter } from "@/lib/edit/audio";
import { cardY, cropFor, faceOnScreen } from "@/lib/edit/effects";
import { buildEditPrompt, editPlanSchema, sanitizePlan, soundCues, supportedEffects, timedTranscript } from "@/lib/edit/plan";
import { analyzeVideo, faceAt, MASK_SIZE } from "@/lib/edit/vision";
import { captionAt, decodeArgs, encodeArgs, type EditRenderInput, renderEdit, zoomAt } from "@/lib/edit/render";
import type { LlmProvider } from "@/lib/providers/types";
import { CloudflareTranscriber } from "@/lib/providers/whisper";
import { editChangesSchema, editRequestSchema } from "@/lib/queue/films";

const dir = mkdtempSync(path.join(tmpdir(), "edit-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const words = "today I will share three easy ways to save money every month".split(" ").map((word, i) => ({ word, start: 0.5 + i * 0.4, end: 0.5 + i * 0.4 + 0.35 }));

describe("transcription", () => {
  it("asks Whisper large-v3-turbo for the language and keeps word timings", async () => {
    let body: Record<string, unknown> = {};
    const fetchFn = (async (url: string, init: RequestInit) => {
      expect(url).toContain("@cf/openai/whisper-large-v3-turbo");
      body = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify({
          result: {
            text: "नमस्ते दोस्तों",
            transcription_info: { language: "hi" },
            segments: [{ words: [{ word: " नमस्ते", start: 0.1, end: 0.6 }, { word: "दोस्तों ", start: 0.7, end: 1.2 }, { word: " ", start: 1.2, end: 1.3 }] }],
          },
        }),
      );
    }) as unknown as typeof fetch;
    const t = await new CloudflareTranscriber("acc", "tok", fetchFn).transcribe(Buffer.from("wav"), "hi");
    expect(body.language).toBe("hi");
    expect(typeof body.audio).toBe("string");
    expect(t.language).toBe("hi");
    expect(t.words).toEqual([
      { word: "नमस्ते", start: 0.1, end: 0.6 },
      { word: "दोस्तों", start: 0.7, end: 1.2 },
    ]);
  });
});

describe("edit plan", () => {
  it("gives the AI a timed transcript and the creator's ending choice", () => {
    expect(timedTranscript(words.slice(0, 5))).toBe("[0.5] today I will share [2.1] three");
    const prompt = buildEditPrompt({ words, durationSec: 6, ending: "none" });
    expect(prompt).toContain("Do not add a cta card.");
    expect(prompt).toContain("Never invent numbers");
    expect(buildEditPrompt({ words, durationSec: 6, zooms: false })).toContain("zooms: []");
  });

  it("keeps the plan inside the video, without overlaps or unwanted endings", () => {
    const plan = editPlanSchema.parse({
      title: "Save money",
      zooms: [{ start: 1, end: 2 }, { start: 1.5, end: 2.5 }, { start: 4, end: 9 }, { start: 5, end: 5.2 }],
      cards: [
        { type: "point", text: "3 easy ways", start: 1, end: 3 },
        { type: "point", text: "overlaps", start: 2, end: 4 },
        { type: "cta", text: "Follow", start: 5, end: 7 },
      ],
    });
    const clean = sanitizePlan(plan, 6, "none");
    expect(clean.zooms).toEqual([{ start: 1, end: 2 }, { start: 4, end: 6 }]);
    expect(clean.cards.map((c) => c.type === "point" && c.text)).toEqual(["3 easy ways"]);
  });

  it("validates upload options", () => {
    expect(editRequestSchema.parse({}).captions).toBe(true);
    expect(() => editRequestSchema.parse({ keyword: "two words" })).toThrow();
    expect(editRequestSchema.parse({ language: "ta", ending: "follow" }).language).toBe("ta");
  });
});

describe("rendering helpers", () => {
  it("eases zooms in and out", () => {
    const zooms = [{ start: 2, end: 3 }];
    expect(zoomAt(zooms, 1)).toBe(1);
    expect(zoomAt(zooms, 2.5)).toBeCloseTo(1.14, 2);
    expect(zoomAt(zooms, 3.4)).toBe(1);
  });

  it("shows 3-word phrases from real timings, highlighting the word being said", () => {
    expect(captionAt(words, 0.2)).toBeNull();
    expect(captionAt(words, 0.6)).toEqual({ phrase: ["today", "I", "will"], active: 0 });
    expect(captionAt(words, 1.35)).toEqual({ phrase: ["today", "I", "will"], active: 2 });
    expect(captionAt(words, 1.75)?.phrase[0]).toBe("share");
  });

  it("decodes any video to 1080x1920 frames and keeps the original audio", () => {
    expect(decodeArgs("in.mov", 1080, 1920).join(" ")).toContain("force_original_aspect_ratio=increase,crop=1080:1920");
    const enc = encodeArgs("in.mov", "out.mp4", 1080, 1920);
    expect(enc.join(" ")).toContain("-map 0:v -map 1:a?");
  });
});

describe("face-aware effects", () => {
  const face: [number, number, number, number] = [0.6, 0.3, 0.3, 0.15];

  it("asks for effects only when they're on and keeps them apart from cards", () => {
    expect(buildEditPrompt({ words, durationSec: 6, effects: true })).toContain('"backdrop"');
    expect(buildEditPrompt({ words, durationSec: 6, effects: false })).toContain("effects: []");
    const plan = sanitizePlan(
      editPlanSchema.parse({
        title: "t",
        cards: [{ type: "point", text: "Card", start: 1, end: 3 }],
        effects: [
          { type: "backdrop", text: "MONEY", start: 2, end: 3 },
          { type: "spotlight", start: 2, end: 3 },
          { type: "stamp", text: "MYTH", start: 3.2, end: 3.6 },
          { type: "focus", start: 4, end: 12 },
          { type: "cutout", start: 4.5, end: 5.5 },
        ],
      }),
      8,
    );
    // Backdrop overlaps the card; the stamp is too short; the cutout overlaps the focus.
    expect(plan.effects.map((e) => e.type)).toEqual(["spotlight", "focus"]);
    expect(plan.effects[1]).toMatchObject({ start: 4, end: 8 });
  });

  it("drops effects the video analysis can't support", () => {
    const effects = editPlanSchema.parse({ title: "t", effects: [{ type: "spotlight", start: 1, end: 2 }, { type: "focus", start: 3, end: 4 }] }).effects;
    expect(supportedEffects(effects, { faces: true, mask: false }).map((e) => e.type)).toEqual(["focus"]);
    expect(supportedEffects(effects, { faces: false, mask: true })).toEqual([]);
  });

  it("punches in on the face and keeps cards off it", () => {
    expect(cropFor(1, face, 1080, 1920, 0.42)).toEqual({ sx: 0, sy: 0, sw: 1080, sh: 1920 });
    const crop = cropFor(1.25, face, 1080, 1920, 0.42);
    // Face centre (0.75, 0.375) stays inside the crop, clamped to the right edge.
    expect(crop.sx).toBeCloseTo(1080 - 1080 / 1.25);
    const box = faceOnScreen(face, crop, 1080, 1920)!;
    expect(box.w).toBeCloseTo(0.3 * 1080 * 1.25);
    // A face low in the frame pushes the card to the top.
    expect(cardY({ x: 300, y: 1000, w: 400, h: 400 }, 1920)).toBeCloseTo(0.3 * 1920);
    expect(cardY({ x: 300, y: 400, w: 400, h: 300 }, 1920)).toBeCloseTo(0.6 * 1920);
    expect(cardY(null, 1920)).toBeCloseTo(0.6 * 1920);
  });

  const hasMediapipe = (() => {
    try {
      execFileSync("python3", ["-c", "import mediapipe"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();

  it.skipIf(!hasMediapipe)("analyses a video into face boxes and a mask in the same 9:16 frame", async () => {
    const src = path.join(dir, "vis.mp4");
    execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30:duration=1", "-pix_fmt", "yuv420p", src]);
    const v = await analyzeVideo(src, path.join(dir, "vis"));
    expect(v).not.toBeNull();
    expect(v!.faces).toHaveLength(30);
    const size = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height", "-of", "csv=p=0", v!.mask]).toString().trim();
    expect(size).toBe(`${MASK_SIZE.w},${MASK_SIZE.h}`);
  }, 120_000);

  it("works without the analyser, so edits never fail because of it", async () => {
    expect(await analyzeVideo("missing.mp4", path.join(dir, "none"), { python: "no-such-python" })).toBeNull();
  });

  it("looks up the face for a time", () => {
    expect(faceAt([face, null], 30, 0)).toEqual(face);
    expect(faceAt([face, null], 30, 5)).toBeNull();
    expect(faceAt([], 30, 1)).toBeNull();
  });
});

describe("voice and sound effects", () => {
  it("keeps the creator's own voice: cleaned, or deeper with formants kept", () => {
    expect(voiceFilter("natural")).not.toContain("rubberband");
    expect(voiceFilter("clear")).toContain("afftdn");
    expect(voiceFilter("clear")).toContain("loudnorm");
    expect(voiceFilter("deeper")).toContain("rubberband=pitch=0.89:formant=preserved");
  });

  it("puts a sound on each moment, never two at once", () => {
    const plan = editPlanSchema.parse({
      title: "t",
      zooms: [{ start: 2, end: 3 }],
      cards: [{ type: "stat", value: 3, label: "ways", start: 1.9, end: 4 }],
      effects: [{ type: "stamp", text: "MYTH", start: 5, end: 6 }],
    });
    expect(soundCues(plan).map((c) => [c.sound, c.at])).toEqual([
      ["whoosh", 1.85],
      ["stamp", 5.15],
    ]);
  });

  it("mixes the voice and every cue in one FFmpeg command", () => {
    const args = mixArgs({
      source: "in.mp4",
      voice: "clear",
      durationSec: 6,
      cues: [{ sound: "pop", at: 1 }, { sound: "pop", at: 2.5 }, { sound: "boom", at: 4, volume: 0.7 }],
      files: { pop: "pop.wav", boom: "boom.wav" },
      output: "out.m4a",
    });
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain("asplit=2");
    expect(graph).toContain("adelay=2500|2500");
    expect(graph).toContain("amix=inputs=4");
    expect(graph).toContain("afftdn");
    // A silent video gets a silent bed so the sounds still play.
    expect(mixArgs({ source: null, voice: "deeper", durationSec: 2, cues: [{ sound: "pop", at: 0 }], files: { pop: "p.wav" }, output: "o.m4a" }).join(" ")).toContain("anullsrc");
  });

  it("synthesises every sound effect", () => {
    for (const s of Object.keys(SOUNDS) as (keyof typeof SOUNDS)[]) {
      const file = path.join(dir, `${s}.wav`);
      execFileSync("ffmpeg", soundArgs(s, file));
      const d = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString());
      expect(d).toBeCloseTo(SOUNDS[s].d, 1);
    }
  }, 30_000);
});

describe("edit pipeline", () => {
  it("transcribes, plans and renders; skips the AI plan when nothing is said", async () => {
    const llm = { modelId: "llama-3.3-70b", writeScript: async () => ({}) as never, completeJson: async () => ({ title: "Save money", zooms: [{ start: 1, end: 2 }], cards: [] }) } as unknown as LlmProvider;
    const transcriber = { modelId: "whisper", transcribe: async () => ({ text: "x", language: "en", words }) };
    let rendered: EditRenderInput | undefined;
    const stages: string[] = [];
    const mixes: unknown[] = [];
    const deps = {
      llm,
      transcriber,
      probeDuration: async () => 6,
      extractAudio: async (_src: string, wav: string) => (writeFileSync(wav, "wav"), true),
      render: async (i: EditRenderInput) => void (rendered = i),
      analyze: async () => null,
      mixAudio: async (o: { output: string }) => (mixes.push(o), o.output),
    };
    const res = await runEditVideo(deps, { source: "in.mp4", watermark: true, ending: "none" }, path.join(dir, "a"), (s) => void stages.push(s));
    expect(stages).toEqual(["script", "assemble", "done"]);
    expect(res.title).toBe("Save money");
    expect(rendered).toMatchObject({ captions: true, words, plan: { zooms: [{ start: 1, end: 2 }], effects: [] }, vision: null });
    // The zoom gets a whoosh, so a soundtrack is mixed.
    expect(mixes).toHaveLength(1);
    expect(rendered!.audio).toMatch(/soundtrack\.m4a$/);

    const silent = await runEditVideo({ ...deps, extractAudio: async () => false }, { source: "in.mp4", watermark: false }, path.join(dir, "b"));
    expect(silent.title).toBe("My video");
    expect(rendered!.words).toEqual([]);
  });

  it("keeps effects when the person is found, and leaves the audio alone when nothing changes it", async () => {
    const llm = {
      modelId: "llama-3.3-70b",
      completeJson: async () => ({ title: "t", effects: [{ type: "spotlight", start: 1, end: 2 }, { type: "focus", start: 3, end: 4 }] }),
    } as unknown as LlmProvider;
    const transcriber = { modelId: "whisper", transcribe: async () => ({ text: "x", language: "en", words }) };
    let rendered: EditRenderInput | undefined;
    let mixed = false;
    const faces = [[0.3, 0.3, 0.3, 0.15] as [number, number, number, number]];
    // Like the real analyser: writes faces.json next to the mask.
    const analyze = async (_src: string, outDir: string) => {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(path.join(outDir, "faces.json"), JSON.stringify({ fps: 30, faces }));
      return { fps: 30, faces, mask: path.join(outDir, "mask.mkv") };
    };
    const deps = {
      llm,
      transcriber,
      probeDuration: async () => 6,
      extractAudio: async (_src: string, wav: string) => (writeFileSync(wav, "wav"), true),
      render: async (i: EditRenderInput) => void (rendered = i),
      analyze,
      mixAudio: async () => ((mixed = true), "x"),
    };
    await runEditVideo(deps, { source: "in.mp4", watermark: false, sounds: false }, path.join(dir, "c"));
    expect(rendered!.plan.effects.map((e) => e.type)).toEqual(["spotlight", "focus"]);
    expect(rendered!.vision).toEqual({ fps: 30, faces, mask: path.join(dir, "c", "vision", "mask.mkv") });
    expect(mixed).toBe(false);
    expect(rendered!.audio).toBeNull();

    await runEditVideo(deps, { source: "in.mp4", watermark: false, sounds: false, effects: false, voice: "deeper" }, path.join(dir, "d"));
    expect(rendered!.plan.effects).toEqual([]);
    expect(mixed).toBe(true);
  });

  it("stops for review, then renders the creator's changes from the saved plan", async () => {
    const llm = {
      modelId: "llama-3.3-70b",
      completeJson: async () => ({
        title: "Save money",
        zooms: [{ start: 1, end: 2 }],
        cards: [{ type: "point", text: "3 ways", start: 3, end: 5.5 }],
        effects: [{ type: "backdrop", text: "MONEY", start: 0.5, end: 1.5 }],
      }),
    } as unknown as LlmProvider;
    const transcriber = { modelId: "whisper", transcribe: async () => ({ text: "x", language: "en", words }) };
    const workDir = path.join(dir, "review");
    let analysed = 0;
    let rendered: EditRenderInput | undefined;
    const deps = {
      llm,
      transcriber,
      probeDuration: async () => 6,
      extractAudio: async (_src: string, wav: string) => (writeFileSync(wav, "wav"), true),
      // Faces but no outline: mask effects are dropped.
      analyze: async () => (analysed++, { fps: 30, faces: [[0.3, 0.3, 0.3, 0.15] as [number, number, number, number]], mask: "" }),
      render: async (i: EditRenderInput) => void (rendered = i),
      mixAudio: async (o: { output: string }) => o.output,
    };
    const res = await runEditVideo(deps, { source: "in.mp4", watermark: true, review: true, voice: "clear" }, workDir);
    expect(res.output).toBeNull();
    expect(rendered).toBeUndefined();
    const state = await loadEditState(workDir);
    expect(state.available).toEqual({ faces: true, mask: false });
    expect(state.plan.effects).toEqual([]);

    // The creator turns the card into a stamp moment, removes the zoom and switches voice.
    const changes = editChangesSchema.parse({
      plan: { ...state.plan, zooms: [], cards: [], effects: [{ type: "stamp", text: "SAVED", start: 3, end: 4 }, { type: "spotlight", start: 4.5, end: 5.5 }] },
      voice: "deeper",
      sounds: false,
    });
    const next = applyEditChanges(state, changes);
    expect(next.plan.effects.map((e) => e.type)).toEqual(["stamp"]);
    expect(next.request).toMatchObject({ voice: "deeper", sounds: false, watermark: true, source: "in.mp4" });

    await renderPlannedEdit(deps, next, workDir);
    expect(analysed).toBe(1);
    expect(rendered!.plan.zooms).toEqual([]);
    expect(rendered!.audio).toMatch(/soundtrack\.m4a$/);
    expect(() => editChangesSchema.parse({ plan: { title: "t", effects: [{ type: "stamp", text: "", start: 1, end: 2 }] } })).toThrow();
  });

  it("renders a real edit with every effect: 1080x1920, same length, audio kept", async () => {
    const src = path.join(dir, "src.mp4");
    execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30:duration=2", "-f", "lavfi", "-i", "sine=duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-shortest", src]);
    const output = path.join(dir, "out.mp4");
    // A fake analysis: a face in the upper middle and a person mask in the centre.
    const mask = path.join(dir, "mask.mkv");
    execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", `color=black:size=${MASK_SIZE.w}x${MASK_SIZE.h}:rate=30:duration=2,drawbox=x=135:y=200:w=270:h=760:color=white:t=fill,format=gray`, "-c:v", "ffv1", mask]);
    const vision = { fps: 30, faces: Array(60).fill([0.35, 0.25, 0.3, 0.15]), mask };
    const plan = editPlanSchema.parse({
      title: "t",
      zooms: [{ start: 0.5, end: 1.2 }],
      cards: [{ type: "point", text: "Big idea", start: 0.2, end: 0.9 }],
      effects: [
        { type: "backdrop", text: "WOW", start: 0, end: 0.5 },
        { type: "spotlight", start: 0.9, end: 1.3 },
        { type: "cutout", start: 1.3, end: 1.6 },
        { type: "stamp", text: "MYTH", start: 1.6, end: 1.8 },
        { type: "focus", label: "Me", start: 1.8, end: 2 },
      ],
    });
    await renderEdit({ source: src, output, durationSec: 2, plan, words: words.slice(0, 3), captions: true, watermark: true, fontsDir: path.resolve("assets/fonts"), vision });
    const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", output]).toString());
    expect(Number(info.format.duration)).toBeCloseTo(2, 0);
    expect(info.streams.find((s: { codec_type: string }) => s.codec_type === "video")).toMatchObject({ width: 1080, height: 1920 });
    expect(info.streams.some((s: { codec_type: string }) => s.codec_type === "audio")).toBe(true);
  }, 60_000);
});
