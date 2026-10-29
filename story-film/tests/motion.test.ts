import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runMotionReel } from "@/lib/motion/pipeline";
import { formatStat, motionFfmpegArgs, renderMotionVideo, type RenderInput } from "@/lib/motion/render";
import { buildMotionPrompt, motionScriptSchema, slideCountFor, slideDurations } from "@/lib/motion/script";
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
    expect(prompt).toContain("exactly 5 slides");
    expect(prompt).toContain("Devanagari");
    expect(prompt).toContain("never invent statistics");
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
    const args = motionFfmpegArgs({ durations: [3, 4], narration: ["a.wav", "b.wav"], music: "m.wav", width: 480, height: 854, watermark: false, output: "o.mp4" });
    const filter = args[args.indexOf("-filter_complex") + 1];
    expect(filter).toContain("adelay=250|250");
    expect(filter).toContain("adelay=3250|3250");
    expect(filter).toContain("volume=0.14");
    expect(args).toContain("pipe:0");
    expect(args[args.indexOf("-t") + 1]).toBe("7.00");
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
      { story: "money tips", durationSec: 20, resolution: "480p", watermark: true, language: "hi" },
      path.join(dir, "pipe"),
      (s) => void stages.push(s),
    );
    expect(stages).toEqual(["script", "audio", "assemble", "done"]);
    expect(res.title).toBe(script.title);
    expect(spoken).toHaveLength(4);
    expect(rendered).toMatchObject({ width: 480, height: 854, watermark: true });
    expect(rendered!.durations).toHaveLength(4);
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
