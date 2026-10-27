import { buildScriptPrompt, parseScript } from "@/lib/pipeline/script";
import type { FilmScript, FilmStyle, LlmProvider } from "./types";

export class OpenRouterLlm implements LlmProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async writeScript(input: { story: string; style: FilmStyle; shotCount: number }): Promise<FilmScript> {
    const res = await this.fetchFn("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: buildScriptPrompt(input.story, input.style, input.shotCount) }],
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return parseScript(data.choices[0].message.content);
  }
}
