import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runEditVideo } from "@/lib/edit/pipeline";
import { buildEditPrompt, editPlanSchema, sanitizePlan, timedTranscript } from "@/lib/edit/plan";
import { captionAt, decodeArgs, encodeArgs, type EditRenderInput, renderEdit, zoomAt } from "@/lib/edit/render";
import type { LlmProvider } from "@/lib/providers/types";
import { CloudflareTranscriber } from "@/lib/providers/whisper";
import { editRequestSchema } from "@/lib/queue/films";

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

describe("edit pipeline", () => {
  it("transcribes, plans and renders; skips the AI plan when nothing is said", async () => {
    const llm = { modelId: "llama-3.3-70b", writeScript: async () => ({}) as never, completeJson: async () => ({ title: "Save money", zooms: [{ start: 1, end: 2 }], cards: [] }) } as unknown as LlmProvider;
    const transcriber = { modelId: "whisper", transcribe: async () => ({ text: "x", language: "en", words }) };
    let rendered: EditRenderInput | undefined;
    const stages: string[] = [];
    const deps = { llm, transcriber, probeDuration: async () => 6, extractAudio: async (_src: string, wav: string) => (writeFileSync(wav, "wav"), true), render: async (i: EditRenderInput) => void (rendered = i) };
    const res = await runEditVideo(deps, { source: "in.mp4", watermark: true, ending: "none" }, path.join(dir, "a"), (s) => void stages.push(s));
    expect(stages).toEqual(["script", "assemble", "done"]);
    expect(res.title).toBe("Save money");
    expect(rendered).toMatchObject({ captions: true, words, plan: { zooms: [{ start: 1, end: 2 }] } });

    const silent = await runEditVideo({ ...deps, extractAudio: async () => false }, { source: "in.mp4", watermark: false }, path.join(dir, "b"));
    expect(silent.title).toBe("My video");
    expect(rendered!.words).toEqual([]);
  });

  it("renders a real edit: 1080x1920, same length, audio kept", async () => {
    const src = path.join(dir, "src.mp4");
    execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30:duration=2", "-f", "lavfi", "-i", "sine=duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-shortest", src]);
    const output = path.join(dir, "out.mp4");
    const plan = { title: "t", zooms: [{ start: 0.5, end: 1.2 }], cards: [{ type: "point" as const, text: "Big idea", start: 0.2, end: 1.8 }] };
    await renderEdit({ source: src, output, durationSec: 2, plan, words: words.slice(0, 3), captions: true, watermark: true, fontsDir: path.resolve("assets/fonts") });
    const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", output]).toString());
    expect(Number(info.format.duration)).toBeCloseTo(2, 0);
    expect(info.streams.find((s: { codec_type: string }) => s.codec_type === "video")).toMatchObject({ width: 1080, height: 1920 });
    expect(info.streams.some((s: { codec_type: string }) => s.codec_type === "audio")).toBe(true);
  }, 60_000);
});
