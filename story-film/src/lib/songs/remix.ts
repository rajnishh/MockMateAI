import { z } from "zod";
import { REMIX_CREDITS } from "@/lib/billing/catalog";
import type { SongAudio } from "@/lib/providers/fal-music";
import {
  FAL_MAX_INPAINT_SEC,
  type CoverInput,
  type ExtendInput,
  type FalSongEditor,
  type ReplaceSectionInput,
} from "@/lib/providers/fal-song-edit";

export const REMIX_KINDS = ["cover", "extend", "replace"] as const;
export type RemixKind = (typeof REMIX_KINDS)[number];

// A remixed song stays within what fal can still edit afterwards (inpaint works up to 240s).
export const MAX_REMIXED_SEC = FAL_MAX_INPAINT_SEC;
export const EXTEND_SEC = { min: 10, max: 60, default: 30 };
// A replaced section is long enough to hear and short enough to keep the rest of the song.
export const SECTION_SEC = { min: 3, max: 60 };

// `lyrics` is always the whole song's lyrics (edited as the creator likes): ACE-Step sings
// the new part from them. Missing style or lyrics fall back to the song's own.
export const remixRequestSchema = z
  .object({
    kind: z.enum(REMIX_KINDS),
    style: z.string().trim().min(3).max(300).optional(),
    lyrics: z.string().trim().min(1).max(3000).optional(),
    startSec: z.number().min(0).max(MAX_REMIXED_SEC).optional(),
    endSec: z.number().min(0).max(MAX_REMIXED_SEC).optional(),
    extendSec: z.number().int().min(EXTEND_SEC.min).max(EXTEND_SEC.max).optional(),
  })
  .superRefine((r, ctx) => {
    if (r.kind === "cover" && !r.style) {
      ctx.addIssue({ code: "custom", path: ["style"], message: "Pick a style for the cover" });
    }
    if (r.kind === "replace") {
      if (r.startSec === undefined || r.endSec === undefined) {
        ctx.addIssue({ code: "custom", path: ["startSec"], message: "Choose the part to replace" });
        return;
      }
      const len = r.endSec - r.startSec;
      if (len < SECTION_SEC.min || len > SECTION_SEC.max) {
        ctx.addIssue({ code: "custom", path: ["endSec"], message: `The part must be ${SECTION_SEC.min}–${SECTION_SEC.max} seconds long` });
      }
    }
  });

export type RemixRequest = z.infer<typeof remixRequestSchema>;

// The request schema plus checks against the song's length.
export function remixSchemaFor(songDurationSec: number) {
  return remixRequestSchema.superRefine((r, ctx) => {
    if (r.kind === "replace" && r.endSec !== undefined && r.endSec > songDurationSec) {
      ctx.addIssue({ code: "custom", path: ["endSec"], message: "The part runs past the end of the song" });
    }
    if (r.kind === "extend" && songDurationSec + (r.extendSec ?? EXTEND_SEC.default) > MAX_REMIXED_SEC) {
      ctx.addIssue({ code: "custom", path: ["extendSec"], message: `Songs can be at most ${MAX_REMIXED_SEC / 60} minutes long` });
    }
    if (songDurationSec > MAX_REMIXED_SEC) {
      ctx.addIssue({ code: "custom", path: ["kind"], message: "This song is too long to remix" });
    }
  });
}

export interface RemixSource {
  audioUrl: string;
  style: string;
  lyrics: string;
  durationSec: number;
}

export type RemixCall =
  | { kind: "cover"; input: CoverInput }
  | { kind: "extend"; input: ExtendInput }
  | { kind: "replace"; input: ReplaceSectionInput };

export function remixCall(req: RemixRequest, song: RemixSource): RemixCall {
  const style = req.style ?? song.style;
  const lyrics = req.lyrics ?? song.lyrics;
  switch (req.kind) {
    case "cover":
      return { kind: "cover", input: { audioUrl: song.audioUrl, style, originalStyle: song.style, lyrics, originalLyrics: song.lyrics } };
    case "extend":
      return { kind: "extend", input: { audioUrl: song.audioUrl, style, lyrics, extendBeforeSec: 0, extendAfterSec: req.extendSec ?? EXTEND_SEC.default } };
    case "replace":
      return { kind: "replace", input: { audioUrl: song.audioUrl, style, lyrics, startSec: req.startSec!, endSec: req.endSec! } };
  }
}

export function runRemix(editor: Pick<FalSongEditor, "cover" | "extend" | "replaceSection">, call: RemixCall): Promise<SongAudio> {
  switch (call.kind) {
    case "cover":
      return editor.cover(call.input);
    case "extend":
      return editor.extend(call.input);
    case "replace":
      return editor.replaceSection(call.input);
  }
}

// The remixed song's length: only extending changes it.
export function remixedDurationSec(req: RemixRequest, songDurationSec: number): number {
  return req.kind === "extend" ? songDurationSec + (req.extendSec ?? EXTEND_SEC.default) : songDurationSec;
}

export function remixCredits(kind: RemixKind): number {
  return REMIX_CREDITS[kind];
}
