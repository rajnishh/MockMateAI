import { NextResponse } from "next/server";
import { z } from "zod";
import { type Character, createCharacter, listCharacters, newCharacterSchema, saveCharacter } from "@/lib/characters";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { publicMediaUrl } from "@/lib/media";
import { buildImage } from "@/lib/providers";
import { getUserId, unauthorized } from "@/lib/session";

const MAX_CHARACTERS = 10;

function view(c: Character) {
  return { id: c.id, name: c.name, description: c.description, style: c.style, imageUrl: publicMediaUrl(c.referenceImageUrl) };
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  return NextResponse.json({ characters: (await listCharacters(getDb(), userId)).map(view) });
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = newCharacterSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }
  const db = getDb();
  if ((await listCharacters(db, userId)).length >= MAX_CHARACTERS) {
    return NextResponse.json({ error: `Up to ${MAX_CHARACTERS} characters` }, { status: 429 });
  }
  // One image generation; quick enough to run in the request.
  const drawn = await createCharacter(buildImage(loadEnv()), parsed.data);
  const character = await saveCharacter(db, userId, drawn);
  return NextResponse.json({ character: view(character) }, { status: 201 });
}
