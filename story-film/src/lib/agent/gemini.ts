import { assertCommercialSafe } from "@/lib/models/licenses";
import { chatHistory, limitedActions, MAX_ACTIONS, plannerTools, type ToolPlanner, type ToolPlannerInput } from "./claude";

// Free with a Google AI Studio key, within Google's per-minute and per-day limits.
export const DEFAULT_GEMINI_AGENT_MODEL = "gemini-2.5-flash";
const API = "https://generativelanguage.googleapis.com/v1beta/models";

type Part = {
  text?: string;
  thought?: boolean;
  functionCall?: { id?: string; name: string; args?: unknown };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
};
type Content = { role: "user" | "model"; parts: Part[] };
type Reply = {
  candidates?: { content?: Content; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

// Ask Reelkar on Gemini: the same actions as tools and the same rules as on Claude. Gemini's REST
// API has no tool runner, so the loop is here: call, run the actions it asks for one at a time in
// its order, send back what they did, until it replies in words.
export class GeminiToolPlanner implements ToolPlanner {
  constructor(
    private readonly apiKey: string,
    readonly modelId = DEFAULT_GEMINI_AGENT_MODEL,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    assertCommercialSafe(modelId);
  }

  async respond({ system, history, message, act }: ToolPlannerInput): Promise<string> {
    const run = limitedActions(act);
    const tools = [
      {
        functionDeclarations: plannerTools().map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.inputSchema })),
      },
    ];
    const contents: Content[] = [
      ...chatHistory(history).map((m): Content => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text }] })),
      { role: "user", parts: [{ text: message }] },
    ];
    for (let i = 0; i < MAX_ACTIONS + 2; i++) {
      const reply = await this.generate({ systemInstruction: { parts: [{ text: system }] }, contents, tools, generationConfig: { maxOutputTokens: 4096 } });
      const candidate = reply.candidates?.[0];
      if (reply.promptFeedback?.blockReason || candidate?.finishReason === "SAFETY" || candidate?.finishReason === "PROHIBITED_CONTENT") {
        return "Sorry, I can't help with that one. Try asking for a different reel.";
      }
      const parts = candidate?.content?.parts ?? [];
      const calls = parts.flatMap((p) => (p.functionCall ? [p.functionCall] : []));
      if (!calls.length) return text(parts);
      // The model's turn goes back unchanged: Gemini checks the thought signatures in it.
      contents.push({ role: "model", parts });
      const results: Part[] = [];
      for (const call of calls) {
        let response: Record<string, unknown>;
        try {
          response = { result: await run(call.name, call.args ?? {}) };
        } catch (err) {
          response = { error: err instanceof Error ? err.message : String(err) };
        }
        results.push({ functionResponse: { ...(call.id ? { id: call.id } : {}), name: call.name, response } });
      }
      contents.push({ role: "user", parts: results });
    }
    return "";
  }

  // One minute per call and one retry on a server or network error. A 429 (free limit reached)
  // throws, and the free planner answers instead.
  private async generate(body: unknown): Promise<Reply> {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchFn(`${API}/${this.modelId}:generateContent`, {
          method: "POST",
          headers: { "x-goog-api-key": this.apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60_000),
        });
      } catch (err) {
        if (attempt < 1) continue;
        throw err;
      }
      if (res.ok) return (await res.json()) as Reply;
      const detail = (await res.text()).slice(0, 500);
      if (res.status >= 500 && attempt < 1) continue;
      throw Object.assign(new Error(`Gemini ${res.status}: ${detail}`), { status: res.status });
    }
  }
}

function text(parts: Part[]): string {
  return parts
    .flatMap((p) => (p.text && !p.thought ? [p.text] : []))
    .join("\n")
    .trim();
}
