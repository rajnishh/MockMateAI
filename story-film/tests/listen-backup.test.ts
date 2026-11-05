import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ChainTranscriber, MemoryRestStore } from "@/lib/ai/chain";
import { buildTranscriber, listenAvailable } from "@/lib/providers";
import { GeminiTranscriber, LocalWhisper, type Transcriber } from "@/lib/providers/whisper";
import type { Env } from "@/lib/env";

const failing = (message: string): Transcriber => ({ modelId: "whisper", transcribe: async () => { throw new Error(message); } });
const hearing = (text: string): Transcriber => ({ modelId: "whisper", transcribe: async () => ({ text, words: [] }) });

describe("listening backup", () => {
  it("switches to the next listener when Workers AI's daily allowance is used up, and rests it", async () => {
    const rests = new MemoryRestStore();
    const chain = new ChainTranscriber(
      [
        { id: "listen:cloudflare", name: "Workers AI", engine: failing("Transcription 429: you have used up your daily free allocation of 10,000 neurons") },
        { id: "listen:local", name: "This computer", engine: hearing("तुम ही हो") },
      ],
      rests,
    );
    expect((await chain.transcribe(Buffer.from("wav"), "hi")).text).toBe("तुम ही हो");
    expect((await rests.get("listen:cloudflare"))?.reason).toBe("limit");
  });

  it("reads whisper.cpp's one-word segments as timed words", async () => {
    let args: string[] = [];
    const exec = async (_bin: string, a: string[]) => {
      args = a;
      const out = a[a.indexOf("-of") + 1];
      await writeFile(`${out}.json`, JSON.stringify({
        result: { language: "hi" },
        transcription: [
          { text: " तुम", offsets: { from: 500, to: 1200 } },
          { text: " ही", offsets: { from: 1200, to: 2600 } },
          { text: "", offsets: { from: 2600, to: 2700 } },
        ],
      }));
    };
    const t = await new LocalWhisper("/models/ggml.bin", "whisper-cli", exec).transcribe(Buffer.from("wav"), "hi");
    expect(t).toEqual({ text: "तुम ही", language: "hi", words: [{ word: "तुम", start: 0.5, end: 1.2 }, { word: "ही", start: 1.2, end: 2.6 }] });
    expect(args.slice(0, 2)).toEqual(["-m", "/models/ggml.bin"]);
    expect(args[args.indexOf("-l") + 1]).toBe("hi");
  });

  it("sends Gemini the recording and keeps only its words", async () => {
    let body: { contents: { parts: Record<string, unknown>[] }[] } | undefined;
    const fetchFn = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return Response.json({ candidates: [{ content: { parts: [{ text: "thinking", thought: true }, { text: " तुम ही हो \n" }] } }] });
    }) as unknown as typeof fetch;
    const t = await new GeminiTranscriber("key", "gemini-3.5-flash", fetchFn).transcribe(Buffer.from("wav"), "hi");
    expect(t).toEqual({ text: "तुम ही हो", language: "hi", words: [] });
    expect(body?.contents[0].parts[0]).toEqual({ inline_data: { mime_type: "audio/wav", data: Buffer.from("wav").toString("base64") } });
    expect(JSON.stringify(body)).toContain("Hindi");
  });

  it("leaves Gemini out when word timings are needed", () => {
    const env = { CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_API_TOKEN: "t", WHISPER_CPP_MODEL: "/m.bin", WHISPER_CPP_BIN: "whisper-cli", GEMINI_API_KEY: "g", GEMINI_LLM_MODEL: "gemini-3.5-flash" } as Env;
    const ids = (needTimings: boolean) => buildTranscriber(env, { needTimings }, new MemoryRestStore()).links.map((l) => l.id);
    expect(ids(false)).toEqual(["listen:cloudflare", "listen:local", "listen:gemini"]);
    expect(ids(true)).toEqual(["listen:cloudflare", "listen:local"]);
    expect(listenAvailable({ GEMINI_API_KEY: "g" } as Env)).toBe(true);
  });
});
