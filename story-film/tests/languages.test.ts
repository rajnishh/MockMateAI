import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildIdeasPrompt } from "@/lib/suggestions";
import { findLanguage, LANGUAGES, writeInRule } from "@/lib/languages";
import { captionFont } from "@/lib/pipeline/captions";
import { buildScriptPrompt } from "@/lib/pipeline/script";
import { buildCopyPrompt } from "@/lib/post-copy";
import { FalQueueClient } from "@/lib/providers/fal";
import { FalChatterboxTts, RoutedTts, SarvamTts, splitForTts } from "@/lib/providers/tts";
import { buildLyricsPrompt } from "@/lib/songs/lyrics";
import { vocalLanguage } from "@/lib/songs/request";
import { findGenre } from "@/lib/songs/styles";
import { transcriptHasCode } from "@/lib/voice/consent";

const dir = mkdtempSync(path.join(tmpdir(), "lang-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("language catalogue", () => {
  it("covers the launch languages with the right engines", () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(["en", "hi", "mr", "bn", "ta", "te", "ar"]);
    expect(findLanguage("ta")?.tts).toBe("sarvam");
    expect(findLanguage("ar")).toMatchObject({ tts: "chatterbox", rtl: true });
  });

  it("asks models for native script everywhere", () => {
    expect(writeInRule("te")).toBe("Write in natural, everyday Telugu using Telugu script (not Latin letters).");
    expect(buildScriptPrompt({ story: "s", style: "animated", shotCount: 3, language: "bn" })).toContain('Bengali using Bengali script');
    expect(buildScriptPrompt({ story: "s", style: "animated", shotCount: 3, language: "bn" })).toContain('Set `language` to "bn"');
    expect(buildLyricsPrompt({ topic: "t", genre: findGenre("pop")!, mood: "", language: "ar", durationSec: 30 })).toContain("Arabic using Arabic script");
    expect(buildCopyPrompt("instagram", { story: "s", language: "mr" })).toContain("Marathi using Devanagari script");
    expect(vocalLanguage("ta")).toBe("ta");
    expect(vocalLanguage("hinglish")).toBe("hi");
  });
});

describe("narration engines", () => {
  const fake = (name: string) => ({ modelId: name === "kokoro" ? "kokoro-82m" : name === "sarvam" ? "sarvam-bulbul" : "chatterbox-multilingual", speak: async (i: { language: string }) => Buffer.from(`${name}:${i.language}`) });

  it("routes each language to its engine and normalises codes", async () => {
    const tts = new RoutedTts({ kokoro: fake("kokoro"), sarvam: fake("sarvam"), chatterbox: fake("chatterbox") });
    expect((await tts.speak({ text: "x", language: "hi" })).toString()).toBe("kokoro:hi");
    expect((await tts.speak({ text: "x", language: "ta-IN" })).toString()).toBe("sarvam:ta");
    expect((await tts.speak({ text: "x", language: "AR" })).toString()).toBe("chatterbox:ar");
  });

  it("reports unconfigured languages instead of guessing", async () => {
    const tts = new RoutedTts({ kokoro: fake("kokoro") });
    expect(tts.supports("en")).toBe(true);
    expect(tts.supports("te")).toBe(false);
    await expect(tts.speak({ text: "x", language: "te" })).rejects.toThrow(/Telugu isn't available/);
  });

  it("calls Sarvam with an Indian locale and decodes the audio", async () => {
    let req: { url: string; init: RequestInit } | undefined;
    const fetchFn = (async (url: string, init: RequestInit) => {
      req = { url, init };
      return Response.json({ audios: [Buffer.from("RIFF").toString("base64")] });
    }) as unknown as typeof fetch;
    const audio = await new SarvamTts("key", "bulbul:v4-flash", fetchFn).speak({ text: "வணக்கம்", language: "ta" });
    expect(req!.url).toBe("https://api.sarvam.ai/text-to-speech");
    expect((req!.init.headers as Record<string, string>)["api-subscription-key"]).toBe("key");
    expect(JSON.parse(req!.init.body as string)).toMatchObject({ text: "வணக்கம்", language_code: "ta-IN", model: "bulbul:v4-flash" });
    expect(audio.toString()).toBe("RIFF");
  });

  it("splits long text for Chatterbox and joins the audio", async () => {
    expect(splitForTts("aaa bbb ccc", 7)).toEqual(["aaa bbb", "ccc"]);
    const wav = path.join(dir, "t.wav");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=duration=1", wav]);
    const voices: string[] = [];
    const fetchFn = (async (url: string, init?: RequestInit) => {
      if (url.startsWith("https://queue.fal.run/")) {
        voices.push(JSON.parse(init!.body as string).voice);
        return Response.json({ request_id: "r", status_url: "s", response_url: "o" });
      }
      if (url === "s") return Response.json({ status: "COMPLETED" });
      return Response.json({ audio: { url: `file://${wav}` } });
    }) as unknown as typeof fetch;
    const audio = await new FalChatterboxTts(new FalQueueClient("k", fetchFn, 0), fetchFn).speak({ text: `${"يوم ".repeat(100)}`, language: "ar" });
    expect(voices).toEqual(["arabic", "arabic"]);
    const out = path.join(dir, "joined.wav");
    execFileSync("bash", ["-c", `cat > ${out}`], { input: audio });
    const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).toString());
    expect(dur).toBeCloseTo(2, 0);
  });
});

describe("captions per script", () => {
  it("picks the font for each script and right-to-left for Arabic", () => {
    expect(captionFont("পাঁচ")).toEqual({ family: "'Noto Sans Bengali', 'Noto Sans'", rtl: false });
    expect(captionFont("தமிழ்").family).toContain("Noto Sans Tamil");
    expect(captionFont("తెలుగు").family).toContain("Noto Sans Telugu");
    expect(captionFont("मराठी").family).toContain("Noto Sans Devanagari");
    expect(captionFont("مرحبا")).toEqual({ family: "'Noto Sans Arabic', 'Noto Sans'", rtl: true });
    expect(captionFont("hello")).toEqual({ family: "'Noto Sans'", rtl: false });
  });
});

describe("consent code in every language", () => {
  it.each([
    ["Marathi words", "माझा कोड चार आठ दोन एक आहे"],
    ["Bengali words", "আমার কোড চার আট দুই এক"],
    ["Bengali numerals", "কোড ৪৮২১"],
    ["Tamil words", "என் குறியீடு நான்கு எட்டு இரண்டு ஒன்று"],
    ["Tamil numerals", "குறியீடு ௪௮௨௧"],
    ["Telugu words", "నా కోడ్ నాలుగు ఎనిమిది రెండు ఒకటి"],
    ["Telugu numerals", "కోడ్ ౪౮౨౧"],
    ["Arabic words", "رمزي أربعة ثمانية اثنان واحد"],
    ["Arabic-Indic numerals", "الرمز ٤٨٢١"],
  ])("%s", (_name, transcript) => {
    expect(transcriptHasCode(transcript, "4821")).toBe(true);
  });

  it("matches both encodings of Bengali য়", () => {
    expect(transcriptHasCode("ছয় ছয় ছয় ছয়", "6666")).toBe(true);
    expect(transcriptHasCode("ছয় ছয় নয় নয়", "6699")).toBe(true);
  });
});

describe("idea suggestions language", () => {
  it("turns a language code into a native-script instruction", () => {
    expect(buildIdeasPrompt({ niche: "cooking", language: "hi" })).toContain("Hindi using Devanagari script");
    expect(buildIdeasPrompt({ niche: "cooking", language: "Hindi" })).toContain("Write in Hindi, in its native script.");
  });
});
