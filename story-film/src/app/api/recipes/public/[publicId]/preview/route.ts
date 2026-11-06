import { getDb } from "@/lib/db";
import { publicRecipe, recipeState } from "@/lib/recipes";
import { serveFile } from "@/lib/serve-file";

// The 15 s preview of the maker's reel, only when the maker chose to show it.
export async function GET(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const found = await publicRecipe(getDb(), publicId);
  const r = found?.recipe;
  if (!r?.previewPath || r.previewKind !== "reel" || recipeState(r) !== "public") return new Response("Not found", { status: 404 });
  return serveFile(req, r.previewPath, { "Content-Type": "video/mp4", "Cache-Control": "public, max-age=3600" });
}
