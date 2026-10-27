import { NextResponse } from "next/server";
import { z } from "zod";
import { CharacterStore } from "@/lib/characters";
import { loadEnv } from "@/lib/env";
import { buildLlm } from "@/lib/providers";
import { getRedis } from "@/lib/queue/films";
import { getUserId } from "@/lib/session";
import { suggestIdeas } from "@/lib/suggestions";

const requestSchema = z.object({
  niche: z.string().trim().max(100).optional(),
  language: z.string().trim().max(30).optional(),
  characterId: z.uuid().optional(),
  kidSafe: z.boolean().default(false),
});

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }
  const userId = await getUserId(false);
  const character =
    parsed.data.characterId && userId
      ? await new CharacterStore(getRedis()).get(userId, parsed.data.characterId)
      : undefined;
  try {
    const ideas = await suggestIdeas(buildLlm(loadEnv()), { ...parsed.data, character });
    return NextResponse.json({ ideas });
  } catch (err) {
    return NextResponse.json({ error: `Couldn't get ideas: ${(err as Error).message}` }, { status: 502 });
  }
}
