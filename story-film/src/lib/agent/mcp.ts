import { z } from "zod";
import { ACTION_NAMES, ACTIONS, isAction } from "./actions";
import { type AgentDeps, decide, runAction, type Turn } from "./agent";
import type { AgentCard } from "./cards";

// Reelkar as a connector for AI assistants (Model Context Protocol over HTTP, stateless JSON
// responses). Each tool is one Ask Reelkar action, so the creator's posting mode, free reels and
// credits apply exactly as in the app, and everything shows up in their Ask Reelkar history.

export const SERVER_INFO = { name: "reelkar", title: "Reelkar", version: "0.1.0" };
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const INSTRUCTIONS = [
  "Reelkar makes short vertical videos (reels) for a creator and posts them to their Instagram and YouTube.",
  "Reels take a minute or two to make: after make_reel or make_week, use list_reels to check progress.",
  'Posting follows the creator\'s setting. In "ask" mode post_reel returns a proposal; only call answer_proposal after the creator clearly says yes or no.',
  "Write ideas in the language the creator wants (codes like hi, ta, en). Never invent statistics.",
].join(" ");

type JsonSchema = Record<string, unknown> & { properties?: Record<string, Record<string, unknown>>; required?: string[] };

// A tool's input schema for assistants: fields that have a fallback in Reelkar are optional.
function inputSchema(schema: z.ZodType): JsonSchema {
  const js = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as JsonSchema;
  delete js.$schema;
  const props = js.properties ?? {};
  if (props.durationSec) props.durationSec = { type: "number", enum: [15, 30, 60], default: 30, description: "Reel length in seconds" };
  if (props.reel) props.reel.description = 'A reel id from list_reels, "R1" for the newest reel, or "latest"';
  js.required = (js.required ?? []).filter((k) => props[k] && !("default" in props[k]));
  if (!js.required.length) delete js.required;
  return js;
}

const answerSchema = z.object({ proposal_id: z.uuid(), approve: z.boolean() });

const READ_ONLY = new Set(["list_reels", "suggest_ideas"]);

export function tools() {
  return [
    ...ACTION_NAMES.map((name) => ({
      name,
      description: ACTIONS[name].description,
      inputSchema: inputSchema(ACTIONS[name].input),
      annotations: { readOnlyHint: READ_ONLY.has(name), openWorldHint: name === "post_reel" || name === "make_week" },
    })),
    {
      name: "answer_proposal",
      description: "Approve or cancel a post Reelkar proposed (posting mode \"ask\"). Only call this after the creator clearly says yes or no.",
      inputSchema: inputSchema(answerSchema),
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
  ];
}

// Cards as plain text for the assistant, with the ids it needs for follow-up calls.
export function cardText(c: AgentCard): string {
  switch (c.type) {
    case "ideas":
      return `Ideas (${c.format}):\n${c.ideas.map((i, n) => `${n + 1}. ${i.title}: ${i.idea}`).join("\n")}`;
    case "reel":
      return `Reel "${c.title}" (id ${c.reelId}): ${c.status}${c.note ? `. ${c.note}` : ""}`;
    case "reels":
      return c.reels.length ? `Reels, newest first:\n${c.reels.map((r, n) => `R${n + 1}: "${r.title}" (id ${r.reelId}, ${r.format}, ${r.status})`).join("\n")}` : "No reels yet.";
    case "proposal":
      return `Needs the creator's approval (proposal id ${c.actionId}): ${c.text}`;
    case "post":
      return c.text;
    case "caption":
      return `Caption for ${c.platform}:\n${c.text}`;
    case "connect":
      return `${c.text} The creator connects accounts in the Reelkar app.`;
    case "settings":
      return `Posting mode is now ${c.postingMode}.`;
    case "credits":
      return `Out of free reels: ${c.text}`;
    case "error":
      return `Problem: ${c.text}`;
  }
}

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method?: string; params?: Record<string, unknown> };
type Reply = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

const ok = (id: Rpc["id"], result: unknown): Reply => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: Rpc["id"], code: number, message: string): Reply => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function callTool(deps: AgentDeps, turn: Turn, name: string, args: unknown, client: string) {
  let reply: { text: string; cards: unknown };
  if (name === "answer_proposal") {
    const a = answerSchema.safeParse(args);
    if (!a.success) return { content: [{ type: "text", text: "proposal_id (from post_reel) and approve are required." }], isError: true };
    reply = await decide(deps, turn, a.data.proposal_id, a.data.approve);
  } else if (isAction(name)) {
    reply = await runAction(deps, turn, name, args ?? {}, `Via ${client}: ${name.replace(/_/g, " ")}`);
  } else {
    return { content: [{ type: "text", text: `Unknown tool ${name}.` }], isError: true };
  }
  const cards = reply.cards as AgentCard[];
  const text = [reply.text, ...cards.map(cardText)].filter(Boolean).join("\n\n") || "Done.";
  return { content: [{ type: "text", text }], structuredContent: { cards }, isError: cards.length > 0 && cards.every((c) => c.type === "error") };
}

// One JSON-RPC message from the assistant. Notifications get no reply (null).
export async function handleRpc(deps: AgentDeps, turn: Turn, msg: Rpc, client = "an AI assistant"): Promise<Reply | null> {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(msg?.id, -32600, "Invalid request");
  const isNotification = msg.id === undefined;
  try {
    switch (msg.method) {
      case "initialize": {
        const asked = String(msg.params?.protocolVersion ?? "");
        return ok(msg.id, {
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        });
      }
      case "ping":
        return ok(msg.id, {});
      case "tools/list":
        return ok(msg.id, { tools: tools() });
      case "tools/call": {
        const name = String(msg.params?.name ?? "");
        return ok(msg.id, await callTool(deps, turn, name, msg.params?.arguments, client));
      }
      default:
        if (isNotification) return null;
        return fail(msg.id, -32601, `Method not found: ${msg.method}`);
    }
  } catch (err) {
    console.error("[mcp]", msg.method, err);
    return isNotification ? null : fail(msg.id, -32603, "Reelkar couldn't do that. Try again.");
  }
}
