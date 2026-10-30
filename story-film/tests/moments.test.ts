import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyCaptionEdits, captionLines, conflicts, editLine, moveSpan, newSpan, resizeSpan } from "@/lib/edit/moments";
import { editPlanSchema, sanitizePlan } from "@/lib/edit/plan";
import { applyEditChanges, type EditState } from "@/lib/edit/state";
import { editChangesSchema } from "@/lib/queue/films";

const words = "today I will show you three money mistakes everyone makes and the fix".split(" ").map((word, i) => ({
  word,
  start: i * 0.5 + (i >= 6 ? 1 : 0),
  end: i * 0.5 + 0.4 + (i >= 6 ? 1 : 0),
}));

describe("moving and stretching moments", () => {
  it("moves inside the video and keeps the length", () => {
    expect(moveSpan({ start: 1, end: 3 }, 0.25, 10)).toEqual({ start: 1.25, end: 3.25 });
    expect(moveSpan({ start: 0.1, end: 1 }, -0.25, 10)).toEqual({ start: 0, end: 0.9 });
    expect(moveSpan({ start: 8, end: 9.9 }, 0.25, 10)).toEqual({ start: 8.1, end: 10 });
  });

  it("stretches within each kind's limits and the video", () => {
    expect(resizeSpan({ start: 1, end: 4.9 }, 0.25, "effect", 10).end).toBe(5);
    expect(resizeSpan({ start: 1, end: 2.6 }, -0.25, "card", 10).end).toBe(2.5);
    expect(resizeSpan({ start: 9, end: 9.5 }, 2, "card", 10)).toEqual({ start: 8.5, end: 10 });
    expect(resizeSpan({ start: 7, end: 9 }, 2, "card", 10)).toEqual({ start: 7, end: 10 });
    expect(newSpan("zoom", 9.5, 10)).toEqual({ start: 8.8, end: 10 });
  });

  it("flags clashes the server would otherwise drop silently", () => {
    const plan = {
      zooms: [{ start: 1, end: 2 }, { start: 2.5, end: 3 }],
      cards: [{ type: "point", start: 4, end: 6 }],
      effects: [{ type: "stamp", start: 5, end: 6 }, { type: "spotlight", start: 0, end: 1 }, { type: "focus", start: 1.2, end: 2 }],
    };
    const c = conflicts(plan);
    expect([...c.keys()].sort()).toEqual(["e0", "e2", "z1"]);
    expect(c.get("e0")).toContain("card");
    // Turning the card off clears the stamp; moving the zoom away clears it.
    expect(conflicts({ ...plan, zooms: [{ start: 1, end: 2 }, { start: 3, end: 3.5 }] }, new Set(["c0", "e2"])).size).toBe(0);
  });

  it("agrees with the server: a plan without clashes passes sanitizePlan unchanged", () => {
    const plan = editPlanSchema.parse({
      title: "t",
      zooms: [{ start: 1, end: 2 }, { start: 3, end: 4 }],
      cards: [{ type: "point", text: "x", start: 4, end: 11.5 }],
      effects: [{ type: "spotlight", start: 0, end: 1 }, { type: "stamp", text: "MYTH", start: 1.5, end: 3 }],
    });
    expect(conflicts(plan).size).toBe(0);
    expect(sanitizePlan(plan, 20)).toEqual(plan);
  });
});

describe("caption words", () => {
  it("groups captions into lines at pauses", () => {
    const lines = captionLines(words);
    expect(lines.map((l) => l.text)).toEqual(["today I will show you three", "money mistakes everyone makes and the fix"]);
  });

  it("keeps word timings when the count matches, spreads them otherwise, and removes empty lines", () => {
    const [first, second] = captionLines(words);
    const fixed = editLine(words, first, "today I will show you 3");
    expect(fixed[5]).toEqual({ ...words[5], word: "3" });
    const shorter = editLine(words, first, "here are three");
    expect(shorter.slice(0, 3).map((w) => [w.word, w.start, w.end])).toEqual([["here", 0, 0.97], ["are", 0.97, 1.93], ["three", 1.93, 2.9]]);
    expect(editLine(words, second, "  ")).toHaveLength(6);
    // Edits to several lines apply together.
    const both = applyCaptionEdits(words, [first, second], ["hi", "money mistakes"]);
    expect(both.map((w) => w.word)).toEqual(["hi", "money", "mistakes"]);
  });

  it("saves fixed words for the render, kept inside the video", () => {
    const state = { request: { source: "a", watermark: false }, durationSec: 5, hasAudio: true, transcript: { text: "", words }, plan: { title: "t", zooms: [], cards: [], effects: [] }, available: { faces: true, mask: true }, renders: 0 } as EditState;
    const changes = editChangesSchema.parse({ plan: state.plan, words: [{ word: " hello ", start: 1, end: 1.5 }, { word: "late", start: 9, end: 10 }, { word: "first", start: 0, end: 0.5 }] });
    expect(applyEditChanges(state, changes).transcript.words).toEqual([
      { word: "first", start: 0, end: 0.5 },
      { word: "hello", start: 1, end: 1.5 },
      { word: "late", start: 5, end: 5 },
    ]);
    expect(applyEditChanges(state, { plan: state.plan }).transcript.words).toBe(words);
    expect(() => editChangesSchema.parse({ plan: state.plan, words: [{ word: "", start: 0, end: 1 }] })).toThrow();
  });
});

it("the mobile app's copy of the timing rules matches the server's", () => {
  expect(readFileSync("mobile/src/lib/moments.ts", "utf8")).toBe(readFileSync("src/lib/edit/moments.ts", "utf8"));
});
