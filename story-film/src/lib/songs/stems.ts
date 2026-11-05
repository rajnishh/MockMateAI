import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { readMedia } from "@/lib/media";
import { audioExt } from "@/lib/providers/fal-music";
import { STEMS, type StemName, stemFile, writeStemsState } from "./mix";

export interface StemSeparator {
  readonly modelId: string;
  separateAll(audioUrl: string): Promise<Record<StemName, string>>;
}

export interface StemTools {
  ffmpeg: (args: string[]) => Promise<void>;
  fetchFn?: typeof fetch;
}

// Splits a song into its four stems with Demucs and saves them as mp3s in dir, writing the
// state file the Studio polls. Stems are written under temporary names and renamed at the end,
// so a half-finished split never looks ready.
export async function separateSongStems(separator: StemSeparator, songFile: string, dir: string, tools: StemTools): Promise<void> {
  await mkdir(dir, { recursive: true });
  const upload = path.join(dir, "upload.mp3");
  try {
    // fal can't read local files; a 160k mp3 keeps the inline upload small.
    await tools.ffmpeg(["-y", "-loglevel", "error", "-i", songFile, "-ac", "2", "-b:a", "160k", upload]);
    const urls = await separator.separateAll(`data:audio/mpeg;base64,${(await readFile(upload)).toString("base64")}`);
    await Promise.all(
      STEMS.map(async (stem) => {
        const data = await readMedia(urls[stem], tools.fetchFn);
        const part = `${stemFile(dir, stem)}.part`;
        if (audioExt(data, "mp3") === "mp3") {
          await writeFile(part, data);
        } else {
          const raw = `${part}.${audioExt(data, "wav")}`;
          await writeFile(raw, data);
          await tools.ffmpeg(["-y", "-loglevel", "error", "-i", raw, "-b:a", "192k", "-f", "mp3", part]);
          await rm(raw, { force: true });
        }
      }),
    );
    for (const stem of STEMS) await rename(`${stemFile(dir, stem)}.part`, stemFile(dir, stem));
    await writeStemsState(dir, { status: "ready" });
  } finally {
    await rm(upload, { force: true });
  }
}
