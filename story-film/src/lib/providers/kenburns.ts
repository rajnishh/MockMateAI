import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { LocalMediaStore } from "@/lib/media";
import { readMedia } from "@/lib/media";
import { FRAME_SIZE } from "@/lib/pipeline/assemble";
import type { Resolution, VideoProvider } from "./types";

const FPS = 24;

// Camera moves cycled per shot so consecutive stills don't feel identical.
const MOVES = [
  { z: "min(zoom+0.0012,1.2)", x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" },
  { z: "if(eq(on,0),1.2,max(zoom-0.0012,1.0))", x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" },
  { z: "1.15", x: "(iw-iw/zoom)*on/FRAMES", y: "ih/2-(ih/zoom/2)" },
  { z: "1.15", x: "(iw-iw/zoom)*(1-on/FRAMES)", y: "ih/3-(ih/zoom/3)" },
];

export function buildKenBurnsArgs(image: string, output: string, durationSec: number, resolution: Resolution, move: number): string[] {
  const { w, h } = FRAME_SIZE[resolution];
  const frames = Math.ceil(durationSec * FPS);
  const m = MOVES[move % MOVES.length];
  const expr = (e: string) => e.replaceAll("FRAMES", String(frames));
  return [
    "-y",
    "-loglevel", "error",
    "-i", image,
    "-vf",
    // Upscale first so zoompan has pixels to work with and doesn't jitter.
    `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},` +
      `zoompan=z='${expr(m.z)}':x='${expr(m.x)}':y='${expr(m.y)}':d=${frames}:s=${w}x${h}:fps=${FPS}`,
    "-frames:v", String(frames),
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    output,
  ];
}

function moveFor(seed: string): number {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash;
}

// Free-mode "video": a slow pan or zoom over the keyframe, rendered locally.
export class KenBurnsVideo implements VideoProvider {
  readonly modelId = "ken-burns-ffmpeg";

  constructor(
    private readonly media: LocalMediaStore,
    private readonly runFfmpeg: (args: string[]) => Promise<void>,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async animate(input: { imageUrl: string; prompt: string; durationSec: number; resolution: Resolution }): Promise<{ url: string }> {
    const dir = await mkdtemp(path.join(tmpdir(), "kenburns-"));
    try {
      const image = path.join(dir, "in.img");
      const output = path.join(dir, "out.mp4");
      await writeFile(image, await readMedia(input.imageUrl, this.fetchFn));
      await this.runFfmpeg(buildKenBurnsArgs(image, output, input.durationSec, input.resolution, moveFor(input.prompt + input.imageUrl)));
      return { url: await this.media.put(await readFile(output), "mp4") };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
