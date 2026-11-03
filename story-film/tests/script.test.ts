import { describe, expect, it } from "vitest";
import { creatorMessage } from "@/lib/creator-errors";
import { buildScriptPrompt, GarbledScriptError, parseScript } from "@/lib/pipeline/script";
import { OpenAiCompatibleLlm } from "@/lib/providers/llm";
import { filmJobSchema } from "@/lib/queue/films";

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

describe("Indian art styles", () => {
  it("puts the chosen art style into every image prompt and accepts it in film jobs", () => {
    const prompt = buildScriptPrompt({ story: "A peacock learns to dance in the rain", style: "madhubani", shotCount: 6 });
    expect(prompt).toContain("Madhubani (Mithila) folk painting style");
    const job = filmJobSchema.parse({ userId: "u", story: "A clever crow and a thirsty afternoon", style: "warli", durationSec: 30 });
    expect(job.style).toBe("warli");
    expect(() => filmJobSchema.parse({ userId: "u", story: "A clever crow and a thirsty afternoon", style: "cubism", durationSec: 30 })).toThrow();
  });

  // Both shapes below are real replies from the free Llama 3.3 for a pet-montage idea.
  it("names a reel the LLM left untitled after its first narration line", () => {
    const untitled = { ...script, title: "", shots: [{ ...script.shots[0], narration: "" }, { ...script.shots[0], narration: "Funny pets" }] };
    expect(parseScript(JSON.stringify(untitled)).title).toBe("Funny pets");
    expect(parseScript(JSON.stringify({ ...script, title: "  " }), "x").title).toBe("Asha found a lantern.");
  });

  it("rejects a script with no narration at all", () => {
    const silent = { ...script, title: "", language: "ja", shots: [{ ...script.shots[0], narration: "" }] };
    expect(() => parseScript(JSON.stringify(silent), "Compile a montage of pet moments")).toThrow(GarbledScriptError);
  });
});

describe("writeScript with an unreliable LLM", () => {
  const silent = JSON.stringify({ ...script, title: "", language: "ja", shots: [{ ...script.shots[0], narration: "" }] });

  function llmReplying(...replies: string[]) {
    const sent: string[] = [];
    const fetchFn = (async (_url: string, init: RequestInit) => {
      sent.push(String(init.body));
      return Response.json({ choices: [{ message: { content: replies[sent.length - 1] }, finish_reason: "stop" }] });
    }) as unknown as typeof fetch;
    return { llm: new OpenAiCompatibleLlm("https://llm", "key", "llama", { licenseId: "llama-3.3-70b", jsonMode: false }, fetchFn), sent };
  }

  it("asks once more when the first reply is garbled", async () => {
    const { llm, sent } = llmReplying(silent, JSON.stringify(script));
    expect((await llm.writeScript({ story: "A story", style: "cinematic", shotCount: 1 })).title).toBe("The Lantern");
    expect(sent).toHaveLength(2);
  });

  it("gives up after two garbled replies with a plain message", async () => {
    const { llm, sent } = llmReplying(silent, "not json at all");
    const err = await llm.writeScript({ story: "A story", style: "cinematic", shotCount: 1 }).catch((e) => e);
    expect(sent).toHaveLength(2);
    expect(creatorMessage(err)).toMatch(/garbled/);
  });

  it("asks for a title that is never empty", () => {
    expect(buildScriptPrompt({ story: "A story", style: "cinematic", shotCount: 3 })).toContain("never empty");
  });
});
