// What the agent did, shown under its reply. Plain JSON: stored with the message and sent to the apps.
export type PostingMode = "ask" | "auto_schedule" | "auto_now";

// Where a finished reel can be opened: the video file (a short-lived link), the app and the web app.
export type ReelLinks = { video: string; app: string; web: string };

export type AgentCard =
  | { type: "ideas"; ideas: { title: string; hook?: string; idea: string }[]; format: "story" | "motion" | "dance"; language?: string }
  | { type: "reel"; reelId: string; title: string; status: string; note?: string; links?: ReelLinks }
  | { type: "reels"; reels: { reelId: string; title: string; status: string; format: string }[] }
  // Waits for the creator's tap (posting mode "ask"); status is refreshed when history is read.
  | { type: "proposal"; actionId: string; text: string; status: "proposed" | "waiting" | "done" | "cancelled" | "failed" }
  | { type: "post"; text: string; status: "scheduled" | "waiting"; at: string | null; reelId: string }
  | { type: "caption"; reelId: string; platform: string; text: string }
  | { type: "connect"; text: string }
  | { type: "settings"; postingMode: PostingMode }
  | { type: "credits"; text: string }
  | { type: "error"; text: string };

// A short line per card, so the next turn's prompt knows what already happened.
export function summarize(card: AgentCard): string {
  switch (card.type) {
    case "ideas":
      return `suggested ideas: ${card.ideas.map((i) => `"${i.title}"`).join(", ")}`;
    case "reel":
      return `started reel "${card.title}"`;
    case "reels":
      return `listed ${card.reels.length} reels`;
    case "proposal":
      return `asked to approve: ${card.text}`;
    case "post":
      return card.text;
    case "caption":
      return `wrote a ${card.platform} caption`;
    case "connect":
      return "asked to connect Instagram or YouTube";
    case "settings":
      return `posting mode is now ${card.postingMode}`;
    case "credits":
    case "error":
      return `problem: ${card.text}`;
  }
}
