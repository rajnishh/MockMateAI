import { z } from "zod";

// "Mix": the creator's own take (voice, or a filmed clip) with an AI song under it. Free, done with ffmpeg.
// Voice at 0 replaces the voice with the song; no song keeps just the trimmed, faded take.
export const mixSchema = z
  .object({
    takeId: z.uuid(),
    songId: z.uuid().optional(),
    startSec: z.number().finite().min(0).default(0),
    endSec: z.number().finite().positive().optional(),
    fadeInSec: z.number().finite().min(0).max(10).default(0),
    fadeOutSec: z.number().finite().min(0).max(10).default(0),
    voiceVolume: z.number().finite().min(0).max(2).default(1),
    musicVolume: z.number().finite().min(0).max(2).default(0.8),
  })
  .refine((m) => m.endSec === undefined || m.endSec > m.startSec + 1, { message: "Keep at least one second", path: ["endSec"] })
  .refine((m) => m.songId || m.voiceVolume > 0, { message: "Turn your voice up or pick a song", path: ["voiceVolume"] });
export type Mix = z.infer<typeof mixSchema>;

const n = (x: number) => Number(x.toFixed(3));

// The mixed length: the take decides it when it's a video (the picture can't get longer),
// otherwise the longer of the two that can be heard.
export function mixLength(m: Mix, takeSec: number, songSec: number | undefined, video: boolean): number {
  const voiceHeard = m.voiceVolume > 0;
  const full = video || songSec === undefined ? takeSec : voiceHeard ? Math.max(takeSec, songSec) : songSec;
  const end = Math.min(m.endSec ?? full, full);
  if (end - m.startSec < 1) throw new Error("Keep at least one second");
  return end - m.startSec;
}

// The audio filter graph; its output is [a]. `voice` is the take's sound input, `song` the song's (if any).
export function mixAudioFilter(m: Mix, lengthSec: number, inputs: { voice: string; song?: string }): string {
  const fadeIn = Math.min(m.fadeInSec, lengthSec / 2);
  const fadeOut = Math.min(m.fadeOutSec, lengthSec / 2);
  const tail = [
    `atrim=start=${n(m.startSec)}:end=${n(m.startSec + lengthSec)}`,
    "asetpts=PTS-STARTPTS",
    fadeIn > 0 ? `afade=t=in:st=0:d=${n(fadeIn)}` : "",
    fadeOut > 0 ? `afade=t=out:st=${n(lengthSec - fadeOut)}:d=${n(fadeOut)}` : "",
    "alimiter=limit=0.95",
  ]
    .filter(Boolean)
    .join(",");
  if (!inputs.song) return `[${inputs.voice}]volume=${n(m.voiceVolume)},${tail}[a]`;
  return [
    `[${inputs.voice}]aresample=44100,volume=${n(m.voiceVolume)}[v]`,
    `[${inputs.song}]aresample=44100,volume=${n(m.musicVolume)}[m]`,
    `[v][m]amix=inputs=2:duration=longest:normalize=0,${tail}[a]`,
  ].join(";");
}

export function mixAudioArgs(m: Mix, takeMp3: string, songFile: string | undefined, output: string, lengthSec: number): string[] {
  return [
    "-y", "-loglevel", "error",
    "-i", takeMp3,
    ...(songFile ? ["-i", songFile] : []),
    "-filter_complex", mixAudioFilter(m, lengthSec, { voice: "0:a", song: songFile ? "1:a" : undefined }),
    "-map", "[a]",
    "-c:a", "libmp3lame", "-b:a", "192k",
    output,
  ];
}

// A filmed clip: the picture trimmed like the sound, the mixed sound under it, ready for Reels (H.264 + AAC).
export function mixVideoArgs(m: Mix, video: string, takeMp3: string, songFile: string | undefined, output: string, lengthSec: number): string[] {
  const audio = mixAudioFilter(m, lengthSec, { voice: "1:a", song: songFile ? "2:a" : undefined });
  return [
    "-y", "-loglevel", "error",
    "-i", video,
    "-i", takeMp3,
    ...(songFile ? ["-i", songFile] : []),
    "-filter_complex", `[0:v]trim=start=${n(m.startSec)}:end=${n(m.startSec + lengthSec)},setpts=PTS-STARTPTS[vv];${audio}`,
    "-map", "[vv]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    output,
  ];
}
