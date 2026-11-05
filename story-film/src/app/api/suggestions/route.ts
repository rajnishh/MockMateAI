import { NextResponse } from "next/server";
import { llmForUser } from "@/lib/ai/engines";
import { z } from "zod";
import { getCharacter } from "@/lib/characters";
import { getDb } from "@/lib/db";
import { seriesEpisodes } from "@/lib/films";
import { loadEnv } from "@/lib/env";
import { creatorMessage } from "@/lib/creator-errors";
import { isGarbledScript } from "@/lib/pipeline/script";

import { getUserId, unauthorized } from "@/lib/session";
import { IDEA_FORMATS, suggestIdeas } from "@/lib/suggestions";

const requestSchema = z.object({
  niche: z.string().trim().max(100).optional(),
  language: z.string().trim().max(30).optional(),
  characterId: z.uuid().optional(),
  kidSafe: z.boolean().default(false),
  format: z.enum(IDEA_FORMATS).optional(),
  count: z.number().int().min(1).max(8).optional(),
  avoid: z.array(z.string().trim().max(80)).max(16).optional(),
});

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = requestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }
  const { characterId, ...ask } = parsed.data;
  const character = characterId ? await getCharacter(getDb(), userId, characterId) : undefined;
  // A character's earlier reels are its series, so the ideas become next episodes.
  const episodes = character && characterId ? await seriesEpisodes(getDb(), userId, characterId) : undefined;
  try {
    const ideas = await suggestIdeas(await llmForUser(getDb(), loadEnv(), userId), { ...ask, character, episodes });
    return NextResponse.json({ ideas });
  } catch (err) {
    console.error("[suggestions]", err);
    // A plain sentence for the creator, never the raw parser or provider error.
    const why = isGarbledScript(err) ? "The AI's answer came out garbled. Please try again." : creatorMessage(err);
    return NextResponse.json({ error: `Couldn't get ideas. ${why}` }, { status: 502 });
  }
}
