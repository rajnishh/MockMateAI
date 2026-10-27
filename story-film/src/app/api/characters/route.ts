import { NextResponse } from "next/server";
import { z } from "zod";
import { CharacterStore, createCharacter, newCharacterSchema } from "@/lib/characters";
import { loadEnv } from "@/lib/env";
import { publicMediaUrl } from "@/lib/media";
import { buildImage } from "@/lib/providers";
import { getRedis } from "@/lib/queue/films";
import { getUserId } from "@/lib/session";

const MAX_CHARACTERS = 10;

function view(c: { id: string; name: string; description: string; style: string; referenceImageUrl: string }) {
  return { id: c.id, name: c.name, description: c.description, style: c.style, imageUrl: publicMediaUrl(c.referenceImageUrl) };
}

export async function GET() {
  const userId = await getUserId(false);
  if (!userId) return NextResponse.json({ characters: [] });
  const characters = await new CharacterStore(getRedis()).list(userId);
  return NextResponse.json({ characters: characters.map(view) });
}

export async function POST(req: Request) {
  const userId = (await getUserId(true))!;
  const parsed = newCharacterSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }
  const store = new CharacterStore(getRedis());
  if ((await store.list(userId)).length >= MAX_CHARACTERS) {
    return NextResponse.json({ error: `Up to ${MAX_CHARACTERS} characters` }, { status: 429 });
  }
  // One image generation; quick enough to run in the request in Phase 0.
  const character = await createCharacter(buildImage(loadEnv()), parsed.data);
  await store.save(userId, character);
  return NextResponse.json({ character: view(character) }, { status: 201 });
}
