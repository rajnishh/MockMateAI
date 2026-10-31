import { NextResponse } from "next/server";
import { agentDeps } from "@/lib/agent/deps";
import { handleRpc } from "@/lib/agent/mcp";
import { tokenOwner } from "@/lib/agent/tokens";
import { getDb } from "@/lib/db";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";

// Tool calls per creator per hour; the free reel allowance and credits still apply on top.
const HOURLY_CALLS = 300;

const unauthorized = () =>
  NextResponse.json(
    { error: "Add your Reelkar connector key as a Bearer token. Create one at /connect." },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="reelkar"' } },
  );

// Which assistant is calling, for the creator's Ask Reelkar history ("Via Claude: make reel").
function clientName(ua: string | null): string {
  const u = (ua ?? "").toLowerCase();
  if (u.includes("cursor")) return "Cursor";
  if (u.includes("openai") || u.includes("chatgpt")) return "ChatGPT";
  if (u.includes("claude") || u.includes("anthropic")) return "Claude";
  return "an AI assistant";
}

// The Reelkar connector (MCP, Streamable HTTP without streams: every reply is plain JSON).
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const owner = auth.startsWith("Bearer ") ? await tokenOwner(getDb(), auth.slice(7).trim()) : null;
  if (!owner) return unauthorized();
  if (!(await allow(getRedis(), `ratelimit:mcp:${owner.userId}`, HOURLY_CALLS, 3600))) {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Too many requests to Reelkar this hour. Try again later." } }, { status: 429 });
  }
  const body = await req.json().catch(() => undefined);
  if (body === undefined) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });

  const deps = agentDeps();
  const turn = { userId: owner.userId, timeZone: owner.timeZone };
  const client = clientName(req.headers.get("user-agent"));
  const messages = Array.isArray(body) ? body : [body];
  const replies = (await Promise.all(messages.map((m) => handleRpc(deps, turn, m, client)))).filter((r) => r !== null);
  if (!replies.length) return new NextResponse(null, { status: 202 });
  return NextResponse.json(Array.isArray(body) ? replies : replies[0]);
}

// No server-to-assistant stream: assistants poll list_reels for progress instead.
export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
