import { describe, expect, it } from "vitest";
import type { LlmProvider } from "@/lib/providers/types";
import { buildIdeasPrompt, ideaBrief, suggestIdeas } from "@/lib/suggestions";

function fakeLlm(reply: unknown): LlmProvider & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    prompts,
    completeJson: async (prompt: string) => {
      prompts.push(prompt);
      return reply;
    },
  } as unknown as LlmProvider & { prompts: string[] };
}

describe("idea suggestions", () => {
  it("asks for a hook, varied angles and a format, for an Indian audience", () => {
    const prompt = buildIdeasPrompt({ niche: "home cooking", language: "hi", now: new Date("2026-11-04") });
    expect(prompt).toContain("Creator's topic: home cooking");
    expect(prompt).toContain("hook:");
    expect(prompt).toContain("myth vs fact");
    expect(prompt).toContain('"motion"');
    expect(prompt).toContain("Indian viewers");
    expect(prompt).toContain("This month is November");
  });

  it("uses Gulf references for Arabic and keeps one format when asked", () => {
    const prompt = buildIdeasPrompt({ language: "ar", format: "motion", count: 3 });
    expect(prompt).toContain("UAE, Saudi Arabia");
    expect(prompt).toContain('format: always "motion"');
    expect(prompt).toContain("Suggest 3 reel ideas");
  });

  it("continues a series from earlier episodes and skips ideas already shown", () => {
    const prompt = buildIdeasPrompt({
      character: { name: "Mia", description: "toddler with a curly bun" },
      episodes: ["Rainy day colours: Mia finds colours in puddles."],
      avoid: ["Kite day"],
      count: 1,
    });
    expect(prompt).toContain("Suggest 1 next episodes");
    expect(prompt).toContain("- Rainy day colours: Mia finds colours in puddles.");
    expect(prompt).toContain('"Kite day"');
  });

  it("drops weak hooks and fills in the format", async () => {
    const llm = fakeLlm({
      ideas: [
        { title: "Chai mistakes", hook: "You have been making chai wrong for years", idea: "Three mistakes and fixes.", format: "motion" },
        { title: "Rain dance", hook: "Did you know?", idea: "Kids count puddles." },
        { title: "Same", hook: "Same", idea: "A story.", format: "song" },
      ],
    });
    const ideas = await suggestIdeas(llm, { niche: "chai" });
    expect(ideas[0]).toMatchObject({ hook: "You have been making chai wrong for years", format: "motion" });
    expect(ideas[1].hook).toBeUndefined();
    expect(ideas[1].format).toBe("story");
    expect(ideas[2]).toMatchObject({ hook: undefined, format: "story" });
  });

  it("starts the reel text with the hook", () => {
    expect(ideaBrief({ title: "Chai", hook: "Stop boiling milk twice.", idea: "Why it matters." })).toBe("Stop boiling milk twice. Why it matters.");
    expect(ideaBrief({ title: "Chai", hook: "Sachin scored 100 centuries", idea: "A kid tries." })).toBe("Sachin scored 100 centuries. A kid tries.");
    expect(ideaBrief({ title: "Chai", hook: "क्या आप जानते हैं कि चाय कब बनी?", idea: "कहानी।" })).toBe("क्या आप जानते हैं कि चाय कब बनी? कहानी।");
    expect(ideaBrief({ title: "Chai", idea: "Why it matters." })).toBe("Chai. Why it matters.");
  });
});
