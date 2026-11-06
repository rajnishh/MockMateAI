import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { FESTIVAL_SLUGS } from "@/lib/festivals";
import { listRecipes, RECIPE_FORMATS, recipeCollection } from "@/lib/recipes";
import { getUserId } from "@/lib/session";

const PAGE = 20;
const querySchema = z.object({
  collection: z.enum(FESTIVAL_SLUGS as [string, ...string[]]).optional(),
  format: z.enum(RECIPE_FORMATS).optional(),
  list: z.enum(["trending", "new", "free", "kids"]).optional(),
  maker: z.string().regex(/^[a-z0-9._]{3,20}$/).optional(),
  exclude: z.string().optional(),
  lang: z.string().optional(),
  cursor: z.coerce.number().int().min(0).default(0),
});

// Gallery lists and collections. A collection answers with its festival and featured picks;
// ?cursor= is the offset of the next page.
export async function GET(req: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const q = parsed.data;
  const db = getDb();
  const viewerId = await getUserId().catch(() => undefined);
  if (q.collection && !q.maker && !q.list) {
    const c = await recipeCollection(db, q.collection, { viewerId, lang: q.lang, format: q.format });
    return NextResponse.json(c);
  }
  const recipes = await listRecipes(db, { viewerId, list: q.list, format: q.format, collection: q.collection, makerHandle: q.maker, exclude: q.exclude, limit: PAGE + 1, offset: q.cursor });
  return NextResponse.json({ recipes: recipes.slice(0, PAGE), cursor: recipes.length > PAGE ? q.cursor + PAGE : null });
}
