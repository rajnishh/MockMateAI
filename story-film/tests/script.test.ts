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
    const prompt = buildScriptPrompt("A story", "animated", 6);
    expect(prompt).toContain("exactly 6 shots");
    expect(prompt).toContain("3D animated");
  });
});
