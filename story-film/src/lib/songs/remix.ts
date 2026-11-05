import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { REMIX_CREDITS } from "@/lib/billing/catalog";
import type { SongAudio } from "@/lib/providers/fal-music";
import {
  FAL_MAX_INPAINT_SEC,
  type CoverInput,
  type FalSongEditor,
  type ReplaceSectionInput,
} from "@/lib/providers/fal-song-edit";
import { lyricsWithRap, rapStyle } from "./rap";

export const REMIX_KINDS = ["cover", "extend", "replace", "rap"] as const;
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
    // "rap": the new bars for the chosen part (written with AI or by the creator).
    bars: z.string().trim().min(10).max(1200).optional(),
  })
  .superRefine((r, ctx) => {
    if (r.kind === "cover" && !r.style) {
      ctx.addIssue({ code: "custom", path: ["style"], message: "Pick a style for the cover" });
    }
    if (r.kind === "rap" && !r.bars) {
      ctx.addIssue({ code: "custom", path: ["bars"], message: "Write the rap bars first" });
    }
    if (r.kind === "replace" || r.kind === "rap") {
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
    if ((r.kind === "replace" || r.kind === "rap") && r.endSec !== undefined && r.endSec > songDurationSec) {
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

// fal's outpaint re-generates the whole song, so the original part no longer sounds the same (checked
// 2026-11-05). Instead the song is lengthened with a copy of its last seconds and that copy is repainted:
// repainting keeps everything outside the part, and the copy gives the model music to continue from
// (repainting silence stays silent). Songs often fade out, so the last few seconds are cut first and the
// copy comes from just before them; the repaint starts slightly before the cut to hide the join.
export const EXTEND_CUT_SEC = 5;
export const EXTEND_BLEND_SEC = 2;

export interface ExtendByRepaintInput {
  // A local file:// song.
  audioUrl: string;
  style: string;
  lyrics: string;
  extendSec: number;
}

export type RemixCall =
  | { kind: "cover"; input: CoverInput }
  | { kind: "extend"; input: ExtendByRepaintInput }
  | { kind: "replace"; input: ReplaceSectionInput };

export function remixCall(req: RemixRequest, song: RemixSource): RemixCall {
  const style = req.style ?? song.style;
  const lyrics = req.lyrics ?? song.lyrics;
  switch (req.kind) {
    case "cover":
      return { kind: "cover", input: { audioUrl: song.audioUrl, style, originalStyle: song.style, lyrics, originalLyrics: song.lyrics } };
    case "extend":
      return { kind: "extend", input: { audioUrl: song.audioUrl, style, lyrics, extendSec: req.extendSec ?? EXTEND_SEC.default } };
    case "replace":
      return { kind: "replace", input: { audioUrl: song.audioUrl, style, lyrics, startSec: req.startSec!, endSec: req.endSec! } };
    // A rap is a replaced part sung with rap tags and the part's lines swapped for the bars.
    case "rap":
      return {
        kind: "replace",
        input: { audioUrl: song.audioUrl, style: rapStyle(style), lyrics: lyricsWithRap(lyrics, song.durationSec, req.startSec!, req.endSec!, req.bars!), startSec: req.startSec!, endSec: req.endSec! },
      };
  }
}

export interface RemixTools {
  // Where extend writes its lengthened copy (deleted afterwards).
  workDir: string;
  ffmpeg: (args: string[]) => Promise<void>;
  probeDuration: (file: string) => Promise<number>;
}

// Where the original ends in the lengthened song (its fade-out is dropped).
export function extendCutSec(songSec: number): number {
  return Math.max(songSec / 2, songSec - EXTEND_CUT_SEC);
}

// The lengthened song, songSec + extendSec long: the original up to the cut, then the seconds before
// the cut copied (looped if the song is short) to fill the rest.
export function loopPadArgs(input: string, output: string, songSec: number, extendSec: number): string[] {
  const cut = extendCutSec(songSec);
  const fill = songSec + extendSec - cut;
  const from = Math.max(0, cut - fill);
  const head = `[a]atrim=end=${cut.toFixed(3)},asetpts=PTS-STARTPTS[h]`;
  const tail = `[b]atrim=start=${from.toFixed(3)}:end=${cut.toFixed(3)},asetpts=PTS-STARTPTS,aloop=loop=-1:size=${Math.round((cut - from) * 48000)},atrim=end=${fill.toFixed(3)}[t]`;
  return ["-y", "-i", input, "-filter_complex", `[0:a]aresample=48000,asplit[a][b];${head};${tail};[h][t]concat=n=2:v=0:a=1`, "-b:a", "192k", output];
}

export async function runRemix(editor: Pick<FalSongEditor, "cover" | "replaceSection">, call: RemixCall, tools: RemixTools): Promise<SongAudio> {
  switch (call.kind) {
    case "cover":
      return editor.cover(call.input);
    case "replace":
      return editor.replaceSection(call.input);
    case "extend": {
      const { audioUrl, extendSec, style, lyrics } = call.input;
      const source = fileURLToPath(audioUrl);
      const songSec = await tools.probeDuration(source);
      const padded = path.join(tools.workDir, `${randomUUID()}-extend.mp3`);
      try {
        await tools.ffmpeg(loopPadArgs(source, padded, songSec, extendSec));
        return await editor.replaceSection({
          audioUrl: pathToFileURL(padded).href,
          startSec: Math.max(0, extendCutSec(songSec) - EXTEND_BLEND_SEC),
          endSec: songSec + extendSec,
          style,
          lyrics,
        });
      } finally {
        await rm(padded, { force: true });
      }
    }
  }
}

// The remixed song's length: only extending changes it.
export function remixedDurationSec(req: RemixRequest, songDurationSec: number): number {
  return req.kind === "extend" ? songDurationSec + (req.extendSec ?? EXTEND_SEC.default) : songDurationSec;
}

export function remixCredits(kind: RemixKind): number {
  return REMIX_CREDITS[kind];
}

// What the Studio's Remix tab shows for each kind, sent with GET /api/songs so new kinds appear
// without app changes. A kind missing here still shows, with its name and the style and lyrics fields.
export interface RemixKindInfo {
  kind: RemixKind;
  label: string;
  help: string;
  credits: number;
  // Which inputs the kind takes. style "required" means it can't run without one.
  style: "required" | "optional" | "none";
  part: boolean;
  extend: boolean;
  lyrics: boolean;
  bars: boolean;
}

type KindFields = Omit<RemixKindInfo, "kind" | "credits">;
const DEFAULT_FIELDS: Omit<KindFields, "label"> = { help: "", style: "optional", part: false, extend: false, lyrics: true, bars: false };

export const REMIX_KIND_INFO: Partial<Record<RemixKind, Partial<KindFields>>> = {
  cover: { label: "Cover", help: "Sing it again in another style.", style: "required", lyrics: false },
  extend: { label: "Extend", help: "Make it longer. Add new lines at the end of the lyrics for the new part.", extend: true },
  replace: { label: "Replace part", help: "Pick a part you don't like and redo it. Change those lines in the lyrics for new words.", part: true },
  rap: { label: "Add a rap", help: "Pick a part and AI writes rap bars; that part is re-sung as a rap.", part: true, lyrics: false, bars: true },
};

export function remixKindList(): RemixKindInfo[] {
  return REMIX_KINDS.map((kind) => {
    const info = REMIX_KIND_INFO[kind] ?? {};
    const label = info.label ?? kind.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());
    return { ...DEFAULT_FIELDS, ...info, label, kind, credits: remixCredits(kind) };
  });
}
