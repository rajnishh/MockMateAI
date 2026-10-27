import { buildScriptPrompt, parseJson, parseScript } from "@/lib/pipeline/script";
import type { FilmScript, LlmProvider, ScriptRequest } from "./types";

// Any OpenAI-compatible chat endpoint: OpenRouter (paid mode) or
// Cloudflare Workers AI (free mode).
export class OpenAiCompatibleLlm implements LlmProvider {
  // modelId is the license-allowlist key; model is the provider's own model name.
  readonly modelId: string;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly opts: { licenseId: string; jsonMode: boolean },
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.modelId = opts.licenseId;
  }

  async writeScript(input: ScriptRequest): Promise<FilmScript> {
    return parseScript(await this.complete(buildScriptPrompt(input)));
  }

  async completeJson(prompt: string): Promise<unknown> {
    return parseJson(await this.complete(prompt));
  }

  private async complete(prompt: string): Promise<string> {
    const res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        ...(this.opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return data.choices[0].message.content;
  }
}
