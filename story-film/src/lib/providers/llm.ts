import { buildScriptPrompt, isGarbledScript, parseJson, parseScript } from "@/lib/pipeline/script";
import type { FilmScript, LlmProvider, ScriptRequest } from "./types";

// Enough for a 60-second script or a week of reel plans.
const MAX_TOKENS = 4096;

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

  // Replies vary from call to call, so a garbled one gets one more try.
  async writeScript(input: ScriptRequest): Promise<FilmScript> {
    const prompt = buildScriptPrompt(input);
    try {
      return parseScript(await this.complete(prompt), input.story);
    } catch (err) {
      if (!isGarbledScript(err)) throw err;
      console.warn(`Script came back garbled, asking again: ${(err as Error).message.slice(0, 200)}`);
      return parseScript(await this.complete(prompt), input.story);
    }
  }

  // Same for anything else that should come back as JSON: one more try if it doesn't parse.
  async completeJson(prompt: string): Promise<unknown> {
    try {
      return parseJson(await this.complete(prompt));
    } catch (err) {
      if (!(err instanceof SyntaxError)) throw err;
      console.warn(`LLM reply wasn't valid JSON, asking again: ${err.message.slice(0, 200)}`);
      return parseJson(await this.complete(prompt));
    }
  }

  private async complete(prompt: string): Promise<string> {
    const res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        // Workers AI stops at 256 tokens unless asked, which cuts a script's JSON in half.
        max_tokens: MAX_TOKENS,
        ...(this.opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { choices: { message: { content: string }; finish_reason?: string }[] };
    const choice = data.choices[0];
    if (choice.finish_reason === "length") throw new Error(`LLM reply was cut off at ${MAX_TOKENS} tokens`);
    return choice.message.content;
  }
}
