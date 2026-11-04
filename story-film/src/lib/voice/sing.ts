import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readMedia } from "@/lib/media";
import { assertCommercialSafe } from "@/lib/models/licenses";
import { defaultFfmpeg } from "@/lib/ffmpeg";
import type { Stems, VoiceConverter } from "@/lib/providers/voice";

export interface SingDeps {
  separator: { readonly modelId: string; separate(audioUrl: string): Promise<Stems> };
  converter: VoiceConverter;
  fetchFn?: typeof fetch;
  runFfmpeg?: (args: string[]) => Promise<void>;
}

async function toMp3DataUri(runFfmpeg: (args: string[]) => Promise<void>, input: string, output: string): Promise<string> {
  await runFfmpeg(["-y", "-loglevel", "error", "-i", input, "-ac", "2", "-b:a", "160k", output]);
  return `data:audio/mpeg;base64,${(await readFile(output)).toString("base64")}`;
}

// Mixes the converted vocals back over the original backing stems.
export function buildMixArgs(vocals: string, stems: string[], output: string): string[] {
  const inputs = [vocals, ...stems];
  const labels = inputs.map((_, i) => `[${i}:a]`).join("");
  return [
    "-y",
    "-loglevel", "error",
    ...inputs.flatMap((f) => ["-i", f]),
    "-filter_complex",
    `${labels}amix=inputs=${inputs.length}:duration=longest:normalize=0,alimiter=limit=0.95[out]`,
    "-map", "[out]",
    "-c:a", "libmp3lame",
    "-b:a", "192k",
    output,
  ];
}

// Song + the user's voice sample -> the same song sung in their voice (MP3).
export async function singInMyVoice(deps: SingDeps, songFile: string, sampleFile: string, workDir: string): Promise<string> {
  for (const p of [deps.separator, deps.converter]) assertCommercialSafe(p.modelId);
  const runFfmpeg = deps.runFfmpeg ?? defaultFfmpeg;
  const fetchFn = deps.fetchFn ?? fetch;
  await mkdir(workDir, { recursive: true });

  const stems = await deps.separator.separate(await toMp3DataUri(runFfmpeg, songFile, path.join(workDir, "song-in.mp3")));
  const reference = await toMp3DataUri(runFfmpeg, sampleFile, path.join(workDir, "voice-ref.mp3"));
  const converted = await deps.converter.convert({ sourceUrl: stems.vocalsUrl, referenceDataUri: reference });

  const vocals = path.join(workDir, "vocals-mine.wav");
  await writeFile(vocals, "data" in converted ? converted.data : await readMedia(converted.url, fetchFn));
  const backing = await Promise.all(
    stems.accompanimentUrls.map(async (url, i) => {
      const file = path.join(workDir, `stem-${i}.wav`);
      await writeFile(file, await readMedia(url, fetchFn));
      return file;
    }),
  );
  const output = path.join(workDir, "song-my-voice.mp3");
  await runFfmpeg(buildMixArgs(vocals, backing, output));
  return output;
}
