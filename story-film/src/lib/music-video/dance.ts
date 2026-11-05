// Dance moves for music videos come from a short reference clip: either the built-in library
// (generic AI dancers, one per style, made by scripts/make-dance-library.ts) or a clip the
// creator uploaded of themselves dancing, with their consent. We have no rights to other videos.
import path from "node:path";
import type { DanceStyle } from "./shots";

export const DANCE_STYLE_INFO: Record<DanceStyle, { label: string; moves: string }> = {
  bollywood: { label: "Bollywood", moves: "an energetic Bollywood film-song dance with expressive hand gestures, hip sways and spins" },
  bhangra: { label: "Bhangra", moves: "a joyful Punjabi bhangra dance, shoulders bouncing, arms raised high, knees lifting on the dhol beat" },
  hiphop: { label: "Hip-hop", moves: "a confident hip-hop dance with grooves, steps, arm waves and sharp hits on the beat" },
  garba: { label: "Garba", moves: "a graceful Gujarati garba dance with circular steps, claps and turning hand movements" },
  kids: { label: "Kids", moves: "simple, happy kids' action-song moves: clapping, jumping, waving and marching on the spot" },
};

// The built-in reference clips, shipped in the repository.
export function libraryClip(style: DanceStyle, assetsDir = "assets"): string {
  return path.resolve(/*turbopackIgnore: true*/ assetsDir, "dance", `${style}.mp4`);
}

// How long built-in clips are; dance shots are no longer than this.
export const LIBRARY_CLIP_SEC = 5;

// Creator uploads live under OUTPUT_DIR/dance-clips/<userId>/<id>.mp4.
export const DANCE_CLIP_ID = /^[0-9a-f-]{36}$/;
export const MAX_DANCE_CLIP_BYTES = 40 * 1024 * 1024;

export function uploadedClipPath(outputDir: string, userId: string, id: string): string {
  if (!DANCE_CLIP_ID.test(id)) throw new Error("Bad dance clip id");
  return path.resolve(outputDir, "dance-clips", userId.replace(/[^A-Za-z0-9_-]/g, ""), `${id}.mp4`);
}

// Trims a reference clip to the shot, and keeps it small enough to send to fal inline.
export function referenceClipArgs(input: string, seconds: number, output: string): string[] {
  return [
    "-y", "-i", input,
    "-t", String(Math.max(3, Math.ceil(seconds))),
    "-an",
    "-vf", "scale='min(720,iw)':-2,fps=24",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p",
    output,
  ];
}
