// What the web and iPhone storyboard screens see, and the creator's changes to it.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { musicVideoKindCredits, STORYBOARD_REDRAWS } from "@/lib/billing/catalog";
import type { Storyboard } from "./pipeline";
import { KIND_SHOT_TYPES, SHOT_TYPES } from "./shots";

// The original request, saved in the video's folder so the render starts from it.
export const REQUEST_FILE = "request.json";

export const FRAME_NAME = /^(star|shot-\d+-[a-z0-9]+)\.jpg$/;

export function storyboardView(board: Storyboard, base: string) {
  const frameUrl = (u?: string) => (u ? `${base}/frame/${path.basename(fileURLToPath(u))}` : null);
  return {
    kind: board.kind,
    duration: board.duration,
    offset: board.offset,
    bpm: Math.round(board.bpm),
    credits: musicVideoKindCredits(board.kind, board.duration),
    star: board.star ? { description: board.star.description, imageUrl: frameUrl(board.star.image) } : null,
    shotTypes: KIND_SHOT_TYPES[board.kind],
    redrawsLeft: Math.max(0, STORYBOARD_REDRAWS - board.redraws),
    shots: board.shots.map((s) => ({
      start: s.start,
      end: s.end,
      type: s.type,
      lines: s.lines,
      imagePrompt: s.imagePrompt,
      frameUrl: frameUrl(s.frame),
    })),
  };
}

export const storyboardChangesSchema = z.object({
  shots: z
    .array(
      z.object({
        type: z.enum(SHOT_TYPES),
        imagePrompt: z.string().trim().min(3).max(600),
        // Draw this shot's picture again, even with the same words.
        redraw: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(200),
});

// Applies the creator's changes. Returns the shots whose picture must be drawn again.
export function applyStoryboardChanges(board: Storyboard, changes: z.infer<typeof storyboardChangesSchema>): number[] | string {
  if (changes.shots.length !== board.shots.length) return "The storyboard changed; reload it.";
  const allowed = KIND_SHOT_TYPES[board.kind];
  const redraw: number[] = [];
  for (const [i, c] of changes.shots.entries()) {
    if (!allowed.includes(c.type)) return `A ${board.kind} video can't have a ${c.type} shot.`;
    const shot = board.shots[i];
    // A new type changes the framing (close-up to sing, full body to dance), so it's redrawn too.
    if (c.redraw || c.type !== shot.type || c.imagePrompt !== shot.imagePrompt) redraw.push(i);
    shot.type = c.type;
    shot.imagePrompt = c.imagePrompt;
  }
  return redraw;
}
