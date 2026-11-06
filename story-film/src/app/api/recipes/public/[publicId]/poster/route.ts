import { getDb } from "@/lib/db";
import { publicRecipe, recipeState } from "@/lib/recipes";
import { serveFile } from "@/lib/serve-file";

// A shared recipe's poster frame (a JPEG copied at publish).
export async function GET(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const found = await publicRecipe(getDb(), publicId);
  if (!found?.recipe.posterPath || recipeState(found.recipe) !== "public") return new Response("Not found", { status: 404 });
  return serveFile(req, found.recipe.posterPath, { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600" });
}
