import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { agentAction, agentMessage, agentSettings, film } from "@/lib/db/schema";
import type { AgentCard, PostingMode } from "./cards";

export type AgentAction = typeof agentAction.$inferSelect;
export type AgentMessage = typeof agentMessage.$inferSelect;

export async function getPostingMode(db: Db, userId: string): Promise<PostingMode> {
  const [row] = await db.select().from(agentSettings).where(eq(agentSettings.userId, userId));
  return row?.postingMode ?? "ask";
}

export async function setPostingMode(db: Db, userId: string, mode: PostingMode): Promise<void> {
  await db
    .insert(agentSettings)
    .values({ userId, postingMode: mode })
    .onConflictDoUpdate({ target: agentSettings.userId, set: { postingMode: mode, updatedAt: new Date() } });
}

export async function saveMessage(db: Db, userId: string, role: "user" | "assistant", text: string, cards: AgentCard[] = []): Promise<AgentMessage> {
  const [row] = await db.insert(agentMessage).values({ userId, role, text, cards }).returning();
  return row;
}

// The latest messages, oldest first.
export async function recentMessages(db: Db, userId: string, limit = 30): Promise<AgentMessage[]> {
  const rows = await db.select().from(agentMessage).where(eq(agentMessage.userId, userId)).orderBy(desc(agentMessage.createdAt)).limit(limit);
  return rows.reverse();
}

export async function createAction(db: Db, values: { userId: string; name: string; input: unknown; status: AgentAction["status"]; filmId?: string }): Promise<AgentAction> {
  const [row] = await db.insert(agentAction).values(values).returning();
  return row;
}

export async function getAction(db: Db, userId: string, id: string): Promise<AgentAction | undefined> {
  const [row] = await db.select().from(agentAction).where(and(eq(agentAction.id, id), eq(agentAction.userId, userId)));
  return row;
}

// Moves an action on only from the status the caller saw, so two taps can't run it twice.
export async function moveAction(db: Db, id: string, from: AgentAction["status"], values: Partial<Pick<AgentAction, "status" | "error" | "filmId" | "input">>): Promise<boolean> {
  const rows = await db
    .update(agentAction)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(agentAction.id, id), eq(agentAction.status, from)))
    .returning({ id: agentAction.id });
  return rows.length > 0;
}

export async function waitingFor(db: Db, filmId: string): Promise<AgentAction[]> {
  return db.select().from(agentAction).where(and(eq(agentAction.filmId, filmId), eq(agentAction.status, "waiting")));
}

// History for the apps, with each card's status brought up to date (reels finish, approvals happen).
export async function historyView(db: Db, userId: string, limit = 30) {
  const messages = await recentMessages(db, userId, limit);
  const cards = messages.flatMap((m) => m.cards as AgentCard[]);
  const actionIds = cards.flatMap((c) => (c.type === "proposal" ? [c.actionId] : []));
  const reelIds = cards.flatMap((c) => (c.type === "reel" ? [c.reelId] : c.type === "reels" ? c.reels.map((r) => r.reelId) : []));
  const actions = actionIds.length ? await db.select({ id: agentAction.id, status: agentAction.status }).from(agentAction).where(inArray(agentAction.id, actionIds)) : [];
  const films = reelIds.length ? await db.select({ id: film.id, status: film.status, title: film.title }).from(film).where(and(eq(film.userId, userId), inArray(film.id, reelIds))) : [];
  const actionStatus = new Map(actions.map((a) => [a.id, a.status]));
  const filmById = new Map(films.map((f) => [f.id, f]));
  const fresh = (c: AgentCard): AgentCard => {
    if (c.type === "proposal") return { ...c, status: actionStatus.get(c.actionId) ?? c.status };
    if (c.type === "reel") {
      const f = filmById.get(c.reelId);
      return f ? { ...c, status: f.status, title: f.title ?? c.title } : c;
    }
    if (c.type === "reels") return { ...c, reels: c.reels.map((r) => ({ ...r, status: filmById.get(r.reelId)?.status ?? r.status, title: filmById.get(r.reelId)?.title ?? r.title })) };
    return c;
  };
  return messages.map((m) => ({ id: m.id, role: m.role, text: m.text, cards: (m.cards as AgentCard[]).map(fresh), createdAt: m.createdAt.toISOString() }));
}
