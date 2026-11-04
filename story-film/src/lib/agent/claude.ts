import type Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { assertCommercialSafe } from "@/lib/models/licenses";
import { type ActionName, isAction, isConnectorOnly } from "./actions";
import type { AgentCard } from "./cards";
import { cardText, tools } from "./mcp";

// Haiku is quick and cheap enough for chat (about a tenth of a cent per message).
export const DEFAULT_CLAUDE_AGENT_MODEL = "claude-haiku-5-5";
export const MAX_ACTIONS = 5;

export interface ToolPlannerInput {
  system: string;
  history: { role: "user" | "assistant"; text: string }[];
  // The creator's situation plus what they just wrote.
  message: string;
  act(name: ActionName, input: unknown): Promise<AgentCard[]>;
}

// Ask Reelkar's brain when it calls actions as tools: unlike the one-shot JSON planner, it sees
// what each action did (a reel started, no free reels left, no account) before it replies.
export interface ToolPlanner {
  readonly modelId: string;
  respond(input: ToolPlannerInput): Promise<string>;
}

// The actions a tool-calling planner may use, described exactly as the connector describes them
// to assistants. Connector-only tools and proposal answers stay with the connector; approvals are
// buttons in the app.
export function plannerTools() {
  return tools().filter((t) => isAction(t.name) && !isConnectorOnly(t.name));
}

// Runs one action for the model and says what it did; past the limit, says it wasn't done.
export function limitedActions(act: ToolPlannerInput["act"]) {
  let used = 0;
  return async (name: string, input: unknown): Promise<string> => {
    if (++used > MAX_ACTIONS) return `Not done: at most ${MAX_ACTIONS} actions per message. Ask the creator to send the rest as a new message.`;
    const cards = await act(name as ActionName, input);
    return cards.map(cardText).join("\n\n") || "Done.";
  };
}

// The tool loop runs in the Anthropic SDK; each tool is one Ask Reelkar action.
export class ClaudeToolPlanner implements ToolPlanner {
  constructor(
    private readonly client: Anthropic,
    readonly modelId = DEFAULT_CLAUDE_AGENT_MODEL,
  ) {
    assertCommercialSafe(modelId);
  }

  async respond({ system, history, message, act }: ToolPlannerInput): Promise<string> {
    const run = limitedActions(act);
    // The runner starts every call in one reply at once, but actions build on each other
    // ("make_reel" then "post_reel N1"), so they run one at a time in the order Claude wrote them.
    let previous: Promise<unknown> = Promise.resolve();
    const inOrder = <T>(step: () => Promise<T>): Promise<T> => {
      const next = previous.then(step);
      previous = next.catch(() => undefined);
      return next;
    };
    const actionTools = plannerTools().map((t) =>
      betaTool({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as { type: "object" },
        run: (input) => inOrder(() => run(t.name, input)),
      }),
    );
    const final = await this.client.beta.messages.toolRunner({
      model: this.modelId,
      max_tokens: 4096,
      max_iterations: MAX_ACTIONS + 2,
      // Chat, not hard reasoning: low effort keeps replies quick and cheap.
      output_config: { effort: "low" },
      // Tools and the system prompt never change, so they are cached across messages and creators.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: actionTools,
      messages: [...historyMessages(history), { role: "user", content: message }],
    });
    if (final.stop_reason === "refusal") return "Sorry, I can't help with that one. Try asking for a different reel.";
    return final.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("\n")
      .trim();
  }
}

// Earlier turns as Claude chat messages.
function historyMessages(history: ToolPlannerInput["history"]): Anthropic.Beta.BetaMessageParam[] {
  return chatHistory(history).map((m) => ({ role: m.role, content: m.text }));
}

// Earlier turns that have text, starting with the creator's; chat APIs want the creator first.
export function chatHistory(history: ToolPlannerInput["history"]): ToolPlannerInput["history"] {
  const messages = history.filter((m) => m.text.trim());
  while (messages[0]?.role === "assistant") messages.shift();
  return messages;
}
