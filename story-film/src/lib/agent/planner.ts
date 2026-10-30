import { z } from "zod";
import type { Film } from "@/lib/films";
import { findLanguage } from "@/lib/languages";
import { describeActions } from "./actions";
import { type AgentCard, type PostingMode, summarize } from "./cards";
import type { AgentMessage } from "./store";
import { localNow } from "./time";

// What the AI returns for one message: a short reply and the actions to take.
export const planSchema = z.object({
  reply: z.string().max(800).catch(""),
  actions: z
    .array(z.object({ name: z.string(), input: z.unknown().optional() }))
    .max(8)
    .catch([]),
});

const MODE: Record<PostingMode, string> = {
  ask: "ask (each post waits for the creator's approval; the app shows an Approve button)",
  auto_schedule: "auto_schedule (posts are scheduled at good times without asking)",
  auto_now: "auto_now (posts go out as soon as the reel is ready)",
};

export interface PlannerContext {
  turn: { timeZone: string; language?: string; topic?: string };
  state: { mode: PostingMode; reels: Film[]; accounts: { platform: string; name: string }[]; now: Date };
  history: AgentMessage[];
  freeLeft: number | null;
  text: string;
}

export function buildPlannerPrompt(c: PlannerContext): string {
  const now = localNow(c.state.now, c.turn.timeZone);
  const reels = c.state.reels.length
    ? c.state.reels.map((f, i) => `R${i + 1}: "${f.title ?? f.story.slice(0, 60)}" (${f.format}, ${f.status}, made ${f.createdAt.toISOString().slice(0, 10)})`).join("\n")
    : "none yet";
  const accounts = c.state.accounts.length ? c.state.accounts.map((a) => `${a.platform} (${a.name})`).join(", ") : "none connected";
  const history = c.history
    .map((m) => {
      const did = (m.cards as AgentCard[]).map(summarize).join("; ");
      return `${m.role === "user" ? "Creator" : "You"}: ${m.text}${did ? ` [${did}]` : ""}`;
    })
    .join("\n");
  const language = c.turn.language ? (findLanguage(c.turn.language)?.name ?? c.turn.language) : undefined;
  return [
    "You are Ask Reelkar, the assistant inside Reelkar, an app where creators make and post short vertical videos (reels).",
    "The creator tells you what they want; you choose actions. The app does the work and shows the results as cards under your reply.",
    "Reply in the creator's own language and style (Hindi, Hinglish, English, Tamil...), in 1-2 short friendly sentences saying what you're doing. Don't list results; the cards show them.",
    "",
    `Now: ${now.weekday} ${now.date} ${now.time} (${c.turn.timeZone}).`,
    `Creator's usual reel language: ${language ?? "not set (use the language they write in)"}. Their topic: ${c.turn.topic || "not set"}.`,
    `Free reels left this week: ${c.freeLeft ?? "unknown"} (after that each reel costs 1 credit).`,
    `Posting mode: ${MODE[c.state.mode]}.`,
    `Connected accounts: ${accounts}.`,
    "Recent reels (R1 = newest):",
    reels,
    "",
    "Actions (JSON input fields in braces):",
    describeActions(),
    "",
    "Rules:",
    '- Refer to existing reels as "R1", "R2"...; to reels you make in this same reply as "N1", "N2"... (in order). "latest" means the newest.',
    "- Dates are YYYY-MM-DD and times 24-hour HH:MM in the creator's time zone; work out \"tomorrow\", \"Friday\", \"evening\" from Now.",
    "- To make a reel and post it, use make_reel then post_reel with reel \"N1\". For several reels over days, use make_week.",
    '- Pick format "motion" for tips, lists, facts and numbers; "story" for stories, kids\' tales and characters.',
    "- If the creator wants to post but no account is connected, still make the reel; the app will ask them to connect.",
    "- Uploading their own video happens on the Create screen; you can't upload. You can change videos they already uploaded (change_edit).",
    "- If the request is unclear, or not about making, editing or posting reels, ask one short question and use no actions.",
    "- Never promise views, followers or income. At most 5 actions.",
    "",
    "Conversation so far:",
    history || "(new conversation)",
    `Creator: ${c.text}`,
    "",
    'Reply with JSON only: {"reply": string, "actions": [{"name": string, "input": {...}}]}',
  ].join("\n");
}
