import { describe, expect, it } from "vitest";
import { buildScriptPrompt, parseScript } from "@/lib/pipeline/script";

const script = {
  title: "The Lantern",
  language: "hi",
  characters: [{ name: "Asha", description: "girl, 10, red scarf" }],
  shots: [{ narration: "Asha found a lantern.", imagePrompt: "girl, 10, red scarf, holding lantern", motionPrompt: "slow push in" }],
  musicPrompt: "gentle sitar, slow",
};

describe("script", () => {
  it("parses fenced JSON from the LLM", () => {
    expect(parseScript("```json\n" + JSON.stringify(script) + "\n```").title).toBe("The Lantern");
  });

  it("rejects scripts without shots", () => {
    expect(() => parseScript(JSON.stringify({ ...script, shots: [] }))).toThrow();
  });

  it("asks for the requested shot count and style", () => {
    const prompt = buildScriptPrompt({ story: "A story", style: "animated", shotCount: 6 });
    expect(prompt).toContain("exactly 6 shots");
    expect(prompt).toContain("3D animated");
    expect(prompt).not.toContain("young children");
  });

  it("pins a saved character and adds kid-safety rules", () => {
    const prompt = buildScriptPrompt({
      story: "Learns colours",
      style: "animated",
      shotCount: 4,
      kidSafe: true,
      character: { name: "Mia", description: "toddler, curly bun, yellow raincoat", referenceImageUrl: "file:///x.jpg", seed: 7 },
    });
    expect(prompt).toContain('"Mia, toddler, curly bun, yellow raincoat" verbatim');
    expect(prompt).toContain("young children");
  });

  it("extracts JSON surrounded by prose", () => {
    expect(parseScript("Sure! Here it is:\n" + JSON.stringify(script) + "\nEnjoy.").title).toBe("The Lantern");
  });
});
