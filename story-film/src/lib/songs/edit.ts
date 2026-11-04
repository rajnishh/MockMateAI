import { z } from "zod";

// Free edits to a finished song, all done with ffmpeg: crop, fade in/out, speed. Each makes a new copy.
export const songEditSchema = z
  .object({
    startSec: z.number().finite().min(0).default(0),
    endSec: z.number().finite().positive().optional(),
    fadeInSec: z.number().finite().min(0).max(10).default(0),
    fadeOutSec: z.number().finite().min(0).max(10).default(0),
    // Tempo change that keeps the pitch.
    speed: z.number().finite().min(0.75).max(1.5).default(1),
  })
  .refine((e) => e.endSec === undefined || e.endSec > e.startSec, { message: "The end must be after the start", path: ["endSec"] });

export type SongEdit = z.infer<typeof songEditSchema>;

export function isNoop(e: SongEdit, lengthSec: number): boolean {
  return e.startSec === 0 && (e.endSec === undefined || e.endSec >= lengthSec) && e.fadeInSec === 0 && e.fadeOutSec === 0 && e.speed === 1;
}

// The edited length, in seconds. Throws if the crop is out of the song.
export function editedLength(e: SongEdit, lengthSec: number): number {
  const end = Math.min(e.endSec ?? lengthSec, lengthSec);
  if (e.startSec >= end - 1) throw new Error("Keep at least one second of the song");
  return (end - e.startSec) / e.speed;
}

const n = (x: number) => Number(x.toFixed(3));

export function songEditArgs(input: string, output: string, e: SongEdit, lengthSec: number): string[] {
  const out = editedLength(e, lengthSec);
  const end = Math.min(e.endSec ?? lengthSec, lengthSec);
  const filters = [
    e.speed !== 1 ? `atempo=${n(e.speed)}` : "",
    e.fadeInSec > 0 ? `afade=t=in:st=0:d=${n(Math.min(e.fadeInSec, out / 2))}` : "",
    e.fadeOutSec > 0 ? `afade=t=out:st=${n(Math.max(0, out - Math.min(e.fadeOutSec, out / 2)))}:d=${n(Math.min(e.fadeOutSec, out / 2))}` : "",
  ].filter(Boolean);
  return [
    "-y",
    "-ss", String(n(e.startSec)),
    "-t", String(n(end - e.startSec)),
    "-i", input,
    ...(filters.length ? ["-af", filters.join(",")] : []),
    "-c:a", "libmp3lame", "-q:a", "2",
    output,
  ];
}
