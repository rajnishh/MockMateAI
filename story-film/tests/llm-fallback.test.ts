import { describe, expect, it } from "vitest";
import { buildGeminiLlm, buildLlm } from "@/lib/providers";
import { FallbackLlm, OpenAiCompatibleLlm } from "@/lib/providers/llm";
import type { Env } from "@/lib/env";

const reply = (content: string) => Response.json({ choices: [{ message: { content }, finish_reason: "stop" }] });

describe("Gemini as the backup LLM", () => {
  it("asks the backup when Workers AI's free limit has run out", async () => {
    const workersAi = new OpenAiCompatibleLlm("https://cf/v1", "k", "@cf/llama", { licenseId: "llama-3.3-70b", jsonMode: true }, (async () =>
      new Response("you have used up your daily free allocation of 10,000 neurons", { status: 429 })) as unknown as typeof fetch);
    const sent: { url: string; body: Record<string, unknown> }[] = [];
    const gemini = buildGeminiLlm("g", (async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(init.body as string) });
      return reply('{"realPerson": false, "name": null}');
    }) as unknown as typeof fetch);

    const llm = new FallbackLlm(workersAi, gemini);
    expect(await llm.completeJson("check this")).toEqual({ realPerson: false, name: null });
    expect(llm.modelId).toBe("llama-3.3-70b");
    expect(sent[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(sent[0].body).toMatchObject({ model: "gemini-2.5-flash", reasoning_effort: "none", response_format: { type: "json_object" } });
  });

  it("doesn't call the backup when Workers AI answers", async () => {
    let backupCalls = 0;
    const workersAi = new OpenAiCompatibleLlm("https://cf/v1", "k", "@cf/llama", { licenseId: "llama-3.3-70b", jsonMode: true }, (async () => reply('{"ok": 1}')) as unknown as typeof fetch);
    const gemini = buildGeminiLlm("g", (async () => {
      backupCalls++;
      return reply("{}");
    }) as unknown as typeof fetch);
    expect(await new FallbackLlm(workersAi, gemini).completeJson("x")).toEqual({ ok: 1 });
    expect(backupCalls).toBe(0);
  });

  it("is used only when GEMINI_API_KEY is set", () => {
    const cf = { CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_API_TOKEN: "t" } as Env;
    expect(buildLlm(cf)).toBeInstanceOf(OpenAiCompatibleLlm);
    expect(buildLlm({ ...cf, GEMINI_API_KEY: "g" })).toBeInstanceOf(FallbackLlm);
  });
});
