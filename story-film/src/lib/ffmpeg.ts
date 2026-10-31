import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function probeDuration(file: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(stdout.trim());
}

export async function defaultFfmpeg(args: string[]): Promise<void> {
  await execFileAsync("ffmpeg", args, { maxBuffer: 16 * 1024 * 1024 });
}
