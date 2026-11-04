import { assertCommercialSafe } from "@/lib/models/licenses";
import { chatHistory, limitedActions, MAX_ACTIONS, plannerTools, type ToolPlanner, type ToolPlannerInput } from "./claude";

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type Message =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
type Reply = { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] }; finish_reason?: string }[] };

// Ask Reelkar on any OpenAI-style chat API with tool calling: OpenRouter, Groq and Ollama. The
// same actions, rules, 5-action limit and history as on Claude; actions run one at a time in the
// order the model asks for them.
export class OpenAiToolPlanner implements ToolPlanner {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
    readonly modelId: string,
    // The allowlist entry that covers this provider's models (creators pick the model).
    licenseId: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    assertCommercialSafe(licenseId);
  }

  async respond({ system, history, message, act }: ToolPlannerInput): Promise<string> {
    const run = limitedActions(act);
    const tools = plannerTools().map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
    const messages: Message[] = [{ role: "system", content: system }, ...chatHistory(history).map((m) => ({ role: m.role, content: m.text })), { role: "user", content: message }];
    for (let i = 0; i < MAX_ACTIONS + 2; i++) {
      const choice = (await this.complete({ model: this.modelId, messages, tools, max_tokens: 4096 })).choices?.[0];
      if (choice?.finish_reason === "content_filter") return "Sorry, I can't help with that one. Try asking for a different reel.";
      const calls = choice?.message?.tool_calls ?? [];
      if (!calls.length) return (choice?.message?.content ?? "").trim();
      messages.push({ role: "assistant", content: choice?.message?.content ?? null, tool_calls: calls });
      for (const call of calls) {
        let content: string;
        try {
          content = await run(call.function.name, parseArgs(call.function.arguments));
        } catch (err) {
          content = `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
        messages.push({ role: "tool", tool_call_id: call.id, content });
      }
    }
    return "";
  }

  // One minute per call and one retry on a server or network error; a 429 (limit reached) throws.
  private async complete(body: unknown): Promise<Reply> {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) },
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
      throw Object.assign(new Error(`${this.modelId} ${res.status}: ${detail}`), { status: res.status });
    }
  }
}

function parseArgs(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error("The tool input wasn't valid JSON; send it again.");
  }
}
