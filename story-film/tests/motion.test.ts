import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runMotionReel } from "@/lib/motion/pipeline";
import { activeWord, brandPalette, contrastRatio, formatStat, motionFfmpegArgs, renderMotionVideo, type RenderInput, THEMES } from "@/lib/motion/render";
import { applyEnding, buildMotionPrompt, motionScriptSchema, slideCountFor, slideDurations } from "@/lib/motion/script";
import { filmJobSchema } from "@/lib/queue/films";
import type { LlmProvider, TtsProvider } from "@/lib/providers/types";

const dir = mkdtempSync(path.join(tmpdir(), "motion-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const script = {
  title: "पैसे बचाने के 3 तरीके",
  language: "hi",
  theme: "saffron",
  slides: [
    { type: "title", headline: "पैसे बचाने के 3 तरीके", narration: "आज जानिए पैसे बचाने के तीन आसान तरीके" },
    { type: "list", heading: "शुरू करें", items: ["खर्च लिखें", "पहले बचत", "SIP लगाएँ"], narration: "ये तीन आदतें अपनाएँ" },
    { type: "stat", value: 100000, prefix: "₹", label: "एक साल में", narration: "एक साल में एक लाख तक" },
    { type: "cta", text: "और टिप्स चाहिए?", action: "Comment GUIDE", narration: "कमेंट करें गाइड" },
  ],
};

describe("motion reel script", () => {
  it("asks for the right number of slides, the language and no made-up numbers", () => {
    expect(slideCountFor(30)).toBe(5);
    expect(slideCountFor(10)).toBe(3);
    expect(slideCountFor(120)).toBe(10);
    const prompt = buildMotionPrompt({ story: "3 money tips", durationSec: 30, language: "hi" });
    expect(prompt).toContain("about 5 slides");
    expect(prompt).toContain("Devanagari");
    expect(prompt).toContain("Never invent statistics");
  });

  it("validates slides and falls back to a known theme", () => {
    expect(motionScriptSchema.parse({ ...script, theme: "rainbow" }).theme).toBe("navy");
    const badList = { ...script, slides: [script.slides[0], { type: "list", heading: "x", items: ["only one"], narration: "n" }] };
    expect(() => motionScriptSchema.parse(badList)).toThrow();
  });

  it("gives lists time for every item and pads short narration", () => {
    const s = motionScriptSchema.parse(script);
    const d = slideDurations(s, [1, 1, 5, 0.5]);
    expect(d[0]).toBe(3);
    expect(d[1]).toBeCloseTo(1.2 + 3 * 0.7, 1);
    expect(d[2]).toBeCloseTo(5.7, 1);
  });

  it("counts numbers with Indian digit grouping for Indian languages", () => {
    expect(formatStat(100000, 1, "hi")).toBe("1,00,000");
    expect(formatStat(100000, 1, "en")).toBe("100,000");
    expect(formatStat(2.5, 1, "en")).toBe("2.5");
    expect(formatStat(1000, 0.5, "en")).toBe("500");
  });

  it("delays each voice-over to its slide and mixes music under it", () => {
    const args = motionFfmpegArgs({ durations: [3, 4], narration: ["a.wav", "b.wav"], music: "m.wav", width: 480, height: 854, output: "o.mp4" });
    const filter = args[args.indexOf("-filter_complex") + 1];
    expect(filter).toContain("adelay=250|250");
    expect(filter).toContain("adelay=3250|3250");
    expect(filter).toContain("volume=0.14");
    expect(args).toContain("pipe:0");
    expect(args[args.indexOf("-t") + 1]).toBe("7.00");
  });
});

describe("endings, brand and captions", () => {
  it("lets the creator decide the ending; the AI never forces one", () => {
    expect(buildMotionPrompt({ story: "x", durationSec: 30, ending: "none" })).toContain("Do NOT add a call to action");
    expect(buildMotionPrompt({ story: "x", durationSec: 30 })).toContain("Never force it");
    expect(buildMotionPrompt({ story: "x", durationSec: 30, ending: "comment", keyword: "RECIPE" })).toContain('Comment RECIPE');
    expect(buildMotionPrompt({ story: "x", durationSec: 30, ending: "follow", handle: "@priya" })).toContain("@priya");
    const parsed = motionScriptSchema.parse(script);
    expect(applyEnding(parsed, "none").slides.map((x) => x.type)).toEqual(["title", "list", "stat"]);
    expect(applyEnding(parsed, "auto").slides).toHaveLength(4);
  });

  it("validates the keyword and brand colour in film jobs", () => {
    const base = { userId: "u", story: "Three ways to save money every month", style: "animated", durationSec: 30, format: "motion" };
    expect(filmJobSchema.parse({ ...base, ending: "comment", keyword: "GUIDE" }).keyword).toBe("GUIDE");
    expect(() => filmJobSchema.parse({ ...base, keyword: "two words" })).toThrow();
    expect(() => filmJobSchema.parse({ ...base, brand: { accent: "pink" } })).toThrow();
  });

  it("builds a readable palette from any brand colour", () => {
    for (const [accent, background] of [["#ffe600", "light"], ["#1a1a1a", "dark"], ["#e0198a", "light"], ["#0a756b", "dark"]] as const) {
      const p = brandPalette({ accent, background }, THEMES.navy);
      expect(contrastRatio(p.accent, p.bg[0])).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(p.onAccent, p.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.text, p.bg[0])).toBeGreaterThanOrEqual(7);
    }
    expect(brandPalette({ accent: "not-a-colour" }, THEMES.mint)).toBe(THEMES.mint);
  });

  it("moves the caption highlight along the spoken words", () => {
    const words = ["पैसे", "बचाने", "के", "तरीके"];
    expect(activeWord(words, 2, 0)).toBe(0);
    expect(activeWord(words, 2, 1.99)).toBe(3);
    expect(activeWord(words, 2, 5)).toBe(3);
  });
});

describe("motion reel pipeline", () => {
  it("writes the script, voices each slide and renders without image or video models", async () => {
    const stages: string[] = [];
    const spoken: string[] = [];
    let rendered: RenderInput | undefined;
    const llm = { modelId: "llama-3.3-70b", writeScript: async () => ({}) as never, completeJson: async () => script } as unknown as LlmProvider;
    const tts = { modelId: "kokoro-82m", speak: async ({ text }: { text: string }) => (spoken.push(text), Buffer.from("wav")) } as unknown as TtsProvider;
    const res = await runMotionReel(
      { llm, tts, probeDuration: async () => 2, render: async (input) => void (rendered = input) },
      { story: "money tips", durationSec: 20, watermark: true, language: "hi", ending: "none", brand: { accent: "#e0198a", handle: "@priyacooks" } },
      path.join(dir, "pipe"),
      (s) => void stages.push(s),
    );
    expect(stages).toEqual(["script", "audio", "assemble", "done"]);
    expect(res.title).toBe(script.title);
    // "none" removes the model's call to action, so 3 slides are voiced, not 4.
    expect(spoken).toHaveLength(3);
    expect(rendered).toMatchObject({ width: 1080, height: 1920, watermark: true, brand: { handle: "@priyacooks" } });
    expect(rendered!.script.slides.some((sl) => sl.type === "cta")).toBe(false);
    expect(rendered!.spoken).toEqual([2, 2, 2]);
  });

  it("renders a real reel with FFmpeg: right length, video and audio", async () => {
    const s = motionScriptSchema.parse({ ...script, slides: [script.slides[0], script.slides[3]] });
    const narration = [0, 1].map((i) => {
      const f = path.join(dir, `n${i}.wav`);
      execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", f]);
      return f;
    });
    const output = path.join(dir, "reel.mp4");
    await renderMotionVideo({ script: s, durations: [3, 3], narration, width: 480, height: 854, watermark: false, fontsDir: path.resolve("assets/fonts"), output });
    const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width", "-of", "json", output]).toString();
    const info = JSON.parse(probe);
    expect(Number(info.format.duration)).toBeCloseTo(6, 0);
    expect(info.streams.map((x: { codec_type: string }) => x.codec_type).sort()).toEqual(["audio", "video"]);
  }, 60_000);
});
