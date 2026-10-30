import { type ChildProcess, execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Where the person is in each frame, from vision/analyze.py (MediaPipe face detector and selfie
// segmenter, both Apache-2.0, run on CPU). Analysed at half size in the same 9:16 crop as the edit.
export const MASK_SIZE = { w: 540, h: 960 };

// Normalised [x, y, w, h] of the face in the 9:16 frame, or null when no face is seen.
export type FaceBox = [number, number, number, number] | null;

export interface Vision {
  fps: number;
  faces: FaceBox[];
  // Grayscale video: white where the person is.
  mask: string;
}

export function visionDir(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.VISION_DIR ?? "vision");
}

// Runs the analyser; null when Python or the models are missing, so edits still work without effects.
export async function analyzeVideo(source: string, outDir: string, opts: { python?: string; fps?: number } = {}): Promise<Vision | null> {
  const dir = visionDir();
  try {
    await execFileAsync(
      opts.python ?? process.env.PYTHON ?? "python3",
      ["-I", path.join(dir, "analyze.py"), source, outDir, "--models", path.join(dir, "models"), "--width", String(MASK_SIZE.w), "--height", String(MASK_SIZE.h), "--fps", String(opts.fps ?? 30)],
      { maxBuffer: 8 << 20, timeout: 10 * 60_000 },
    );
    const data = JSON.parse(await readFile(path.join(outDir, "faces.json"), "utf8")) as { fps: number; faces: FaceBox[] };
    return { fps: data.fps, faces: data.faces, mask: path.join(outDir, "mask.mkv") };
  } catch (err) {
    console.warn("[edit] vision unavailable, effects that need it are skipped:", (err as Error).message.slice(0, 300));
    return null;
  }
}

export function faceAt(faces: FaceBox[], fps: number, t: number): FaceBox {
  if (!faces.length) return null;
  return faces[Math.min(faces.length - 1, Math.max(0, Math.round(t * fps)))] ?? null;
}

// Reads the mask video one frame at a time, in step with the edit's own frames.
export class MaskReader {
  private proc: ChildProcess;
  private chunks: Buffer[] = [];
  private buffered = 0;
  private ended = false;
  private wake: (() => void) | null = null;
  readonly frameBytes = MASK_SIZE.w * MASK_SIZE.h;

  constructor(file: string) {
    this.proc = spawn("ffmpeg", ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"], { stdio: ["ignore", "pipe", "ignore"] });
    this.proc.stdout!.on("data", (d: Buffer) => {
      this.chunks.push(d);
      this.buffered += d.length;
      // Don't read far ahead of the renderer.
      if (this.buffered > this.frameBytes * 8) this.proc.stdout!.pause();
      this.wake?.();
    });
    const done = () => {
      this.ended = true;
      this.wake?.();
    };
    this.proc.stdout!.on("end", done);
    this.proc.on("error", done);
  }

  // The next frame, or null after the last one (the edit then reuses the last mask).
  async next(): Promise<Buffer | null> {
    while (this.buffered < this.frameBytes && !this.ended) {
      this.proc.stdout!.resume();
      await new Promise<void>((r) => (this.wake = r));
      this.wake = null;
    }
    if (this.buffered < this.frameBytes) return null;
    const all = this.chunks.length === 1 ? this.chunks[0] : Buffer.concat(this.chunks);
    const frame = Buffer.from(all.subarray(0, this.frameBytes));
    const rest = all.subarray(this.frameBytes);
    this.chunks = rest.length ? [rest] : [];
    this.buffered = rest.length;
    if (this.buffered <= this.frameBytes * 8) this.proc.stdout!.resume();
    return frame;
  }

  close() {
    this.proc.kill();
  }
}
