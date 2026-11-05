// Makes the built-in dance reference clips in assets/dance/: one generic AI dancer per style
// (not a real person), full body on a plain background, which Kling motion control copies onto
// the star. We have no rights to existing dance videos, so these are generated, not collected.
//
//   npx tsx scripts/make-dance-library.ts [style ...]
//
// Costs about $0.43 a style on fal (a Nano Banana 2 picture, then 5 s of Kling 2.5 Turbo Pro).
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DANCE_STYLE_INFO, LIBRARY_CLIP_SEC } from "../src/lib/music-video/dance";
import { DANCE_STYLES, type DanceStyle } from "../src/lib/music-video/shots";
import { FalQueueClient } from "../src/lib/providers/fal";

const OUTFIT: Record<DanceStyle, string> = {
  bollywood: "a young woman in a bright pink and gold lehenga",
  bhangra: "a young man in a bright yellow kurta, lungi and pagri",
  hiphop: "a young man in a loose hoodie, cargo pants and sneakers",
  garba: "a young woman in a colourful mirror-work chaniya choli",
  kids: "a cheerful adult dance teacher in a bright t-shirt and joggers",
};

async function main() {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("Set FAL_KEY");
  const fal = new FalQueueClient(key);
  const styles = (process.argv.slice(2).length ? process.argv.slice(2) : DANCE_STYLES) as DanceStyle[];
  const dir = path.resolve("assets/dance");
  mkdirSync(dir, { recursive: true });
  for (const style of styles) {
    const who = OUTFIT[style];
    const image = await fal.run<{ images: { url: string }[] }>("fal-ai/nano-banana-2", {
      prompt:
        `Realistic full-body photo of ${who}, an invented person (not a real or famous person), standing ready to dance, ` +
        "whole body visible from head to toe with space around, facing the camera, plain light grey studio background, even soft light, vertical 9:16",
      aspect_ratio: "9:16",
      num_images: 1,
    });
    const video = await fal.run<{ video: { url: string } }>("fal-ai/kling-video/v2.5-turbo/pro/image-to-video", {
      image_url: image.images[0].url,
      prompt: `The person dances ${DANCE_STYLE_INFO[style].moves}, on the beat, full of energy. Static camera, the whole body always in frame, plain background.`,
      negative_prompt: "camera movement, cut, zoom, cropped body, extra people, blur, distortion",
      duration: String(LIBRARY_CLIP_SEC),
    });
    const raw = path.join(dir, `${style}.raw.mp4`);
    writeFileSync(raw, Buffer.from(await (await fetch(video.video.url)).arrayBuffer()));
    // Small, silent and 720 wide: it's only a reference for the moves.
    const out = path.join(dir, `${style}.mp4`);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-an", "-vf", "scale='min(720,iw)':-2,fps=24", "-c:v", "libx264", "-crf", "26", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]);
    execFileSync("rm", [raw]);
    console.log(`${style}: ${out}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
