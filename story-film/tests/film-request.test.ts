import { describe, expect, it } from "vitest";
import { normaliseLanguage } from "@/lib/languages";
import { parseFilmRequest, StartError } from "@/lib/start-film";
import { findStyle } from "@/lib/styles";

const story = "A little girl in Jaipur chases her kite across the rooftops.";
const parse = (body: Record<string, unknown>) => parseFilmRequest("user-1", { story, durationSec: 30, ...body });

describe("language from apps and assistants", () => {
  it("accepts codes, locales and names, and falls back to auto", () => {
    expect(normaliseLanguage("hi")).toBe("hi");
    expect(normaliseLanguage("hi-IN")).toBe("hi");
    expect(normaliseLanguage("ar_AE")).toBe("ar");
    expect(normaliseLanguage("Hindi")).toBe("hi");
    expect(normaliseLanguage("தமிழ்")).toBe("ta");
    expect(normaliseLanguage("auto")).toBe("auto");
    for (const v of ["", null, undefined, "fr", "Klingon", 7]) expect(normaliseLanguage(v)).toBe("auto");
  });
});

describe("film requests", () => {
  it("fills in a missing style and a loose language instead of rejecting", () => {
    expect(parse({ language: "Hindi" })).toMatchObject({ style: "animated", language: "hi" });
    expect(parse({ style: "", language: "" })).toMatchObject({ style: "animated", language: "auto" });
    expect(parse({ style: null, language: null })).toMatchObject({ style: "animated", language: "auto" });
    expect(parse({ style: "madhubani", language: "hi-IN" })).toMatchObject({ style: "madhubani", language: "hi" });
    expect(parse({ style: "Cinematic" })).toMatchObject({ style: "cinematic" });
    expect(findStyle("3D cartoon")).toBe("animated");
  });

  it("gives motion reels the default style, since they don't use one", () => {
    expect(parse({ format: "motion", style: "something old" })).toMatchObject({ format: "motion", style: "animated" });
  });

  it("explains genuinely bad input in plain words", () => {
    const err = (body: Record<string, unknown>) => {
      try {
        parse(body);
      } catch (e) {
        return e;
      }
    };
    expect(err({ style: "watercolour" })).toEqual(new StartError("Pick a style from the list."));
    expect(err({ story: "too short" })).toEqual(new StartError("Write what your reel is about: at least 20 characters, up to 8,000."));
    expect(err({ durationSec: 600 })).toEqual(new StartError("Pick a length between 10 and 60 seconds."));
    expect(err({ format: "motion", ending: "comment", keyword: "two words" })).toEqual(new StartError("One word, no spaces"));
    expect((err({ style: "watercolour" }) as Error).message).not.toMatch(/✖|expected one of/);
  });
});
