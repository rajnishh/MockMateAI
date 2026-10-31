import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyCaptionEdits,
  captionLines,
  clampZoom,
  conflicts,
  dragSpan,
  dragWord,
  editLine,
  fitZoom,
  MAX_ZOOM,
  moveSpan,
  newSpan,
  resizeSpan,
  scrollForZoom,
  snapPoints,
  snapTime,
} from "@/lib/edit/moments";
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

describe("dragging on the timeline", () => {
  const snaps = [1, 2.5, 4];

  it("snaps to the nearest word start, else to 0.05 s", () => {
    expect(snapTime(2.42, snaps)).toBe(2.5);
    expect(snapTime(3.33, snaps)).toBe(3.35);
    expect(snapPoints(words.slice(0, 2))).toEqual([0, 0.5]);
  });

  it("moves a whole moment, snapping its start and keeping it in the video", () => {
    expect(dragSpan({ start: 1, end: 2 }, "move", 1.45, "effect", 10, snaps)).toEqual({ start: 2.5, end: 3.5 });
    expect(dragSpan({ start: 1, end: 2 }, "move", -5, "effect", 10, snaps)).toEqual({ start: 0, end: 1 });
    expect(dragSpan({ start: 8, end: 9.5 }, "move", 3, "card", 10)).toEqual({ start: 8.5, end: 10 });
  });

  it("pulls one edge within the kind's limits", () => {
    // Start edge: can't pass the end minus the minimum, nor make it longer than the maximum.
    expect(dragSpan({ start: 1, end: 2 }, "start", 0.9, "effect", 10)).toEqual({ start: 1.2, end: 2 });
    expect(dragSpan({ start: 5, end: 6 }, "start", -5, "zoom", 10)).toEqual({ start: 3, end: 6 });
    // End edge: stops at the video's end and at the maximum length.
    expect(dragSpan({ start: 1, end: 2 }, "end", 0.6, "card", 10, snaps)).toEqual({ start: 1, end: 2.5 });
    expect(dragSpan({ start: 1, end: 2 }, "end", 20, "effect", 10)).toEqual({ start: 1, end: 5 });
    expect(dragSpan({ start: 8, end: 9 }, "end", 5, "card", 10)).toEqual({ start: 8, end: 10 });
  });
});

describe("zooming the timeline", () => {
  it("fits the whole video and stops at a close-up", () => {
    expect(fitZoom(300, 60)).toBe(5);
    expect(fitZoom(600, 6)).toBe(100);
    expect(clampZoom(1, 300, 60)).toBe(5);
    expect(clampZoom(1000, 300, 60)).toBe(MAX_ZOOM);
  });

  it("keeps the time under the fingers in place", () => {
    // At 50 px/s, scrolled 100 px, a pinch centred 150 px into the view is at 5 s.
    const scroll = scrollForZoom(100, 150, 50, 100);
    expect((scroll + 150) / 100).toBe(5);
    expect(scrollForZoom(0, 10, 50, 25)).toBe(0);
  });
});

describe("retiming caption words", () => {
  const ws = [
    { word: "a", start: 0, end: 0.4 },
    { word: "b", start: 0.6, end: 1 },
    { word: "c", start: 1.2, end: 1.5 },
  ];

  it("moves a word between its neighbours", () => {
    expect(dragWord(ws, 1, ws[1], "move", 0.1, 5)[1]).toEqual({ word: "b", start: 0.7, end: 1.1 });
    expect(dragWord(ws, 1, ws[1], "move", 1, 5)[1]).toEqual({ word: "b", start: 0.8, end: 1.2 });
    expect(dragWord(ws, 1, ws[1], "move", -1, 5)[1]).toEqual({ word: "b", start: 0.4, end: 0.8 });
    // The others are untouched.
    expect(dragWord(ws, 1, ws[1], "move", 0.1, 5)[0]).toBe(ws[0]);
  });

  it("stretches an edge up to the neighbour, never below 0.05 s, never past the video", () => {
    expect(dragWord(ws, 1, ws[1], "end", 1, 5)[1].end).toBe(1.2);
    expect(dragWord(ws, 1, ws[1], "start", 1, 5)[1].start).toBe(0.95);
    expect(dragWord(ws, 0, ws[0], "start", -1, 5)[0].start).toBe(0);
    expect(dragWord(ws, 2, ws[2], "end", 10, 2)[2].end).toBe(2);
  });

  it("leaves a word in place when there's no room to move it", () => {
    const tight = [{ word: "x", start: 0, end: 1 }, { word: "y", start: 1, end: 2 }, { word: "z", start: 2, end: 3 }];
    expect(dragWord(tight, 1, tight[1], "move", 0.5, 5)).toEqual(tight);
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
