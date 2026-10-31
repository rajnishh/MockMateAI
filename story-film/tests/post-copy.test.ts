import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildCopyPrompt, cleanHashtags, finishCopy, readFilmScript, writePostCopy } from "@/lib/post-copy";
import type { LlmProvider } from "@/lib/providers/types";

const dir = mkdtempSync(path.join(tmpdir(), "copy-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function fakeLlm(reply: unknown): LlmProvider & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    modelId: "llama-3.3-70b",
    prompts,
    writeScript: async () => {
      throw new Error("unused");
    },
    completeJson: async (prompt: string) => {
      prompts.push(prompt);
      return reply;
    },
  };
}

describe("hashtags", () => {
  it("normalises, dedupes and keeps Devanagari", () => {
    expect(cleanHashtags(["kids learning", "#KidsLearning", "##हिंदी", "rain-day!", "", "#"], 5)).toEqual([
      "#kidslearning",
      "#हिंदी",
      "#rainday",
    ]);
  });

  it("caps the count", () => {
    expect(cleanHashtags(["a", "b", "c", "d"], 2)).toEqual(["#a", "#b"]);
    expect(cleanHashtags(["a"], 0)).toEqual([]);
  });
});

describe("finishing copy per platform", () => {
  const raw = { title: "Mia's rainy day #fun", caption: "Mia finds colours in puddles.", hashtags: ["shorts", "colours", "kids"], tags: ["#colours", "kids learning", "colours"] };

  it("YouTube: #Shorts first, clean title, deduped keyword tags, AI line", () => {
    const copy = finishCopy("youtube", raw);
    expect(copy.title).toBe("Mia's rainy day");
    expect(copy.hashtags).toEqual(["#Shorts", "#colours", "#kids"]);
    expect(copy.tags).toEqual(["colours", "kids learning"]);
    expect(copy.text).toBe("Mia finds colours in puddles.\n\nMade with AI.\n\n#Shorts #colours #kids");
  });

  it("WhatsApp: no hashtags or tags", () => {
    const copy = finishCopy("whatsapp", raw);
    expect(copy.hashtags).toEqual([]);
    expect(copy.tags).toEqual([]);
    expect(copy.text).toBe("Mia finds colours in puddles.\n\nMade with AI.");
  });
});

describe("prompt", () => {
  it("adapts to platform, Hindi and children's content", () => {
    const prompt = buildCopyPrompt("instagram", { story: "s", language: "hi", kidSafe: true, narration: ["मिया"] });
    expect(prompt).toContain("Instagram Reels");
    expect(prompt).toContain("Devanagari");
    expect(prompt).toContain("never ask children to comment");
    expect(prompt).toContain("मिया");
  });
});

describe("writing copy end to end", () => {
  it("uses the saved script and validates the reply", async () => {
    writeFileSync(path.join(dir, "script.json"), JSON.stringify({ title: "T", language: "en", characters: [], shots: [{ narration: "Line one", imagePrompt: "p", motionPrompt: "m" }], musicPrompt: "x" }));
    const script = await readFilmScript(path.join(dir, "film.mp4"));
    expect(script?.shots[0].narration).toBe("Line one");
    expect(await readFilmScript(path.join(dir, "missing", "film.mp4"))).toBeUndefined();

    const llm = fakeLlm({ title: "Hook", caption: "Watch this", hashtags: ["a"], tags: [] });
    const copy = await writePostCopy(llm, "instagram", { story: "s", narration: script!.shots.map((s) => s.narration) });
    expect(copy.hashtags).toEqual(["#a"]);
    expect(llm.prompts[0]).toContain("Line one");

    await expect(writePostCopy(fakeLlm({ caption: "no title" }), "youtube", { story: "s" })).rejects.toThrow();
  });
});
