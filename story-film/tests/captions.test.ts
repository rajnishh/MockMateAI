import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildAssembleArgs } from "@/lib/pipeline/assemble";
import { buildCues, chunkWords, renderCaptionImages } from "@/lib/pipeline/captions";
import { buildScriptPrompt } from "@/lib/pipeline/script";

const dir = mkdtempSync(path.join(tmpdir(), "captions-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("caption chunking and timing", () => {
  it("splits narration into short phrases", () => {
    expect(chunkWords("मिया ने आज बारिश में लाल छाता खोला")).toEqual(["मिया ने आज", "बारिश में लाल", "छाता खोला"]);
    expect(chunkWords("Supercalifragilisticexpialidocious is long")).toEqual(["Supercalifragilisticexpialidocious", "is long"]);
  });

  it("spreads phrases across each shot's spoken time", () => {
    const cues = buildCues(["one two three four five six", "hello"], [3, 9], 5);
    expect(cues[0]).toMatchObject({ start: 0, text: "one two three" });
    expect(cues[1]).toMatchObject({ end: 3, text: "four five six" });
    // Narration longer than the clip is capped at the clip boundary.
    expect(cues[2]).toEqual({ start: 5, end: 10, text: "hello" });
  });
});

describe("Hindi script prompt", () => {
  it("asks for Devanagari narration and English image prompts", () => {
    const prompt = buildScriptPrompt({ story: "a story", style: "animated", shotCount: 3, language: "hi" });
    expect(prompt).toContain("Devanagari");
    expect(prompt).toContain("imagePrompt, motionPrompt and musicPrompt are always in English");
  });
});

describe("caption images", () => {
  it("renders one transparent full-width image per phrase", async () => {
    const images = await renderCaptionImages(
      [{ start: 0, end: 1.5, text: "क्षमा कीजिए, ज़िंदगी" }, { start: 1.5, end: 3, text: "Hello there" }],
      "720p",
      path.resolve("assets/fonts"),
      dir,
    );
    expect(images).toHaveLength(2);
    const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height,pix_fmt", "-of", "csv=p=0", images[0].file]);
    expect(probe.toString().trim()).toBe("720,142,rgba");
    expect(images[0]).toMatchObject({ start: 0, end: 1.5, y: 922 });
  });

  it("overlays each caption only during its time window", () => {
    const args = buildAssembleArgs({
      clips: ["c0", "c1"],
      narration: ["n0", "n1"],
      clipSeconds: 5,
      resolution: "720p",
      watermark: false,
      output: "o",
      captions: [
        { file: "cap0.png", start: 0, end: 2.5, y: 900 },
        { file: "cap1.png", start: 2.5, end: 5, y: 900 },
      ],
    });
    const graph = args[args.indexOf("-filter_complex") + 1];
    // 2 clips + 2 narrations + silence = inputs 0-4, so captions are 5 and 6.
    expect(graph).toContain("[vcat][5:v]overlay=x=0:y=900:enable='between(t,0,2.5)'[cap0]");
    expect(graph).toContain("[cap0][6:v]overlay=x=0:y=900:enable='between(t,2.5,5)'[cap1];[cap1]drawtext");
    expect(args.slice(args.indexOf("cap0.png") - 1, args.indexOf("cap0.png") + 1)).toEqual(["-i", "cap0.png"]);
  });
});
