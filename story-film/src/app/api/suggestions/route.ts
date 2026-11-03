import { NextResponse } from "next/server";
import { z } from "zod";
import { getCharacter } from "@/lib/characters";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { creatorMessage } from "@/lib/creator-errors";
import { isGarbledScript } from "@/lib/pipeline/script";
import { buildLlm } from "@/lib/providers";
import { getUserId, unauthorized } from "@/lib/session";
import { suggestIdeas } from "@/lib/suggestions";

const requestSchema = z.object({
  niche: z.string().trim().max(100).optional(),
  language: z.string().trim().max(30).optional(),
  characterId: z.uuid().optional(),
  kidSafe: z.boolean().default(false),
});

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = requestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }
  const character = parsed.data.characterId ? await getCharacter(getDb(), userId, parsed.data.characterId) : undefined;
  try {
    const ideas = await suggestIdeas(buildLlm(loadEnv()), { ...parsed.data, character });
    return NextResponse.json({ ideas });
  } catch (err) {
    console.error("[suggestions]", err);
    // A plain sentence for the creator, never the raw parser or provider error.
    const why = isGarbledScript(err) ? "The AI's answer came out garbled. Please try again." : creatorMessage(err);
    return NextResponse.json({ error: `Couldn't get ideas. ${why}` }, { status: 502 });
  }
}
