import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildClaudePrompt, claudeUrl } from "@/lib/claude-prompt";

describe("Build with Claude prompt", () => {
  it("asks for a dance reel with every detail the creator picked", () => {
    const p = buildClaudePrompt({
      type: "dance",
      idea: "A rain dance for monsoon",
      durationSec: 15,
      language: { code: "hi", name: "Hindi" },
      brand: { accent: "#e0198a", background: "dark", handle: "@chotu" },
      kidSafe: true,
    });
    expect(p).toContain("Reelkar connector");
    expect(p).toContain("Idea: A rain dance for monsoon");
    expect(p).toContain("Length: 15 seconds");
    expect(p).toContain("Language: Hindi (hi)");
    expect(p).toContain("accent colour #e0198a, dark background, handle @chotu");
    expect(p).toContain("make_dance_reel with durationSec 15");
    expect(p).toContain("dress one of them in my accent colour #e0198a");
    expect(p).toContain("get_reel");
    expect(p).toContain('"Open in Reelkar"');
    expect(p).not.toContain("make_reel_from_script");
  });

  it("uses make_reel_from_script with the right shot count for stories", () => {
    const p = buildClaudePrompt({ type: "cartoon", idea: "Mia finds colours in puddles", durationSec: 60, style: "animated", kidSafe: true });
    expect(p).toContain("make_reel_from_script with 12 shots (60 seconds)");
    expect(p).toContain('style "animated" and kidSafe true');
    expect(p).toContain("Language: same as the idea");
    expect(p).toContain("Brand look: none set");
  });

  it("has Claude write motion slides itself, and passes a cartoon's saved character", () => {
    const p = buildClaudePrompt({ type: "motion", idea: "3 chai hacks", durationSec: 30, language: { code: "en", name: "English" } });
    expect(p).toContain('make_motion_reel_from_script: about 6 slides for 30 seconds, narration in "en"');
    const c = buildClaudePrompt({ type: "cartoon", idea: "Mia at the fair", durationSec: 15, character: { id: "c1", name: "Mia", description: "a girl in a yellow frock" } });
    expect(c).toContain('Pass characterId "c1"');
  });

  it("is the same in the mobile app", () => {
    const body = (f: string) => readFileSync(f, "utf8").split("\n").slice(3).join("\n");
    expect(body("mobile/src/lib/claude-prompt.ts")).toBe(body("src/lib/claude-prompt.ts"));
  });

  it("opens a new Claude chat with the prompt filled in", () => {
    const url = claudeUrl("Make a reel: chai & toast?");
    expect(url.startsWith("https://claude.ai/new?q=")).toBe(true);
    expect(decodeURIComponent(url.split("?q=")[1])).toBe("Make a reel: chai & toast?");
  });
});
