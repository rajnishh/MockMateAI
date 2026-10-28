import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { FilmScript, LlmProvider } from "@/lib/providers/types";

export type Platform = "youtube" | "instagram" | "whatsapp";

const PLATFORM_RULES: Record<Platform, string[]> = {
  youtube: [
    "Platform: YouTube Shorts.",
    "title: max 70 characters, curiosity-driven, no clickbait, no hashtags in the title.",
    "caption: the video description, 2-4 short lines, first line repeats the hook.",
    "hashtags: 3-6 relevant hashtags.",
    "tags: 8-12 plain search keywords (no #), mixing broad and specific terms.",
  ],
  instagram: [
    "Platform: Instagram Reels.",
    "title: a short hook, max 60 characters.",
    "caption: first line is a scroll-stopping hook; 2-5 short lines total; end with a question or call to comment.",
    "hashtags: 3-5 highly relevant hashtags (Instagram favours a few precise ones).",
    "tags: empty array.",
  ],
  whatsapp: [
    "Platform: WhatsApp Status / forward.",
    "title: a short hook, max 60 characters.",
    "caption: 1-2 friendly lines that make someone want to watch.",
    "hashtags: empty array.",
    "tags: empty array.",
  ],
};

const copySchema = z.object({
  title: z.string().min(1),
  caption: z.string(),
  hashtags: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

export interface PostCopy {
  title: string;
  caption: string;
  hashtags: string[];
  tags: string[];
  // Ready to paste: caption, hashtags and the AI disclosure line.
  text: string;
}

export interface CopyContext {
  story: string;
  title?: string | null;
  narration?: string[];
  language?: string;
  kidSafe?: boolean;
}

export function buildCopyPrompt(platform: Platform, ctx: CopyContext): string {
  return [
    "Write social media copy for a short vertical AI-generated video.",
    ...PLATFORM_RULES[platform],
    ctx.language === "hi"
      ? "Write title and caption in natural Hindi (Devanagari). Hashtags may mix Hindi and English, as Indian creators do."
      : "Write in the same language as the video narration.",
    ctx.kidSafe
      ? "This is children's content: keep it wholesome, address parents, and never ask children to comment, follow or share."
      : "",
    "Be accurate to the video; don't promise things it doesn't show. No emojis spam (max 2). No links.",
    'Reply with JSON only: {"title":string,"caption":string,"hashtags":string[],"tags":string[]}',
    "",
    `Video title: ${ctx.title ?? "(none)"}`,
    `Idea: ${ctx.story}`,
    ctx.narration?.length ? `Narration:\n${ctx.narration.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// Hashtags must be one token: letters (any script), digits and underscores.
export function cleanHashtags(raw: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of raw) {
    if (out.length >= max) break;
    const body = h.replace(/^#+/, "").replace(/[^\p{L}\p{M}\p{N}_]/gu, "");
    if (!body || seen.has(body.toLowerCase())) continue;
    seen.add(body.toLowerCase());
    out.push(`#${body}`);
  }
  return out;
}

const MAX_HASHTAGS: Record<Platform, number> = { youtube: 6, instagram: 5, whatsapp: 0 };
const AI_LINE = "Made with AI.";

export function finishCopy(platform: Platform, raw: z.infer<typeof copySchema>): PostCopy {
  let hashtags = cleanHashtags(raw.hashtags, MAX_HASHTAGS[platform]);
  // #Shorts helps YouTube classify the upload; keep it first.
  if (platform === "youtube") hashtags = ["#Shorts", ...hashtags.filter((h) => h.toLowerCase() !== "#shorts")].slice(0, 7);
  const tags = platform === "youtube"
    ? [...new Set(raw.tags.map((t) => t.replace(/^#/, "").trim()).filter((t) => t && t.length <= 40))].slice(0, 12)
    : [];
  const title = raw.title.replace(/#\S+/g, "").replace(/\s+/g, " ").trim().slice(0, platform === "youtube" ? 100 : 60);
  const caption = raw.caption.trim();
  const text = [caption, AI_LINE, hashtags.join(" ")].filter(Boolean).join("\n\n");
  return { title, caption, hashtags, tags, text };
}

export async function writePostCopy(llm: LlmProvider, platform: Platform, ctx: CopyContext): Promise<PostCopy> {
  return finishCopy(platform, copySchema.parse(await llm.completeJson(buildCopyPrompt(platform, ctx))));
}

// The worker saves each film's script next to the video; use it when present.
export async function readFilmScript(outputPath: string | null): Promise<FilmScript | undefined> {
  if (!outputPath) return undefined;
  try {
    return JSON.parse(await readFile(path.join(path.dirname(outputPath), "script.json"), "utf8")) as FilmScript;
  } catch {
    return undefined;
  }
}
