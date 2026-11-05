import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { ImageProvider } from "@/lib/providers/types";
import { findGenre } from "./styles";

// AI cover art: one square picture per song, made with the free image provider after the song is ready.
// It's also the music video's poster and the full-screen player's art.
export interface CoverSong {
  title: string;
  genre: string;
  mood: string;
  lyrics: string;
}

// The first few sung lines give the picture its subject ("rain on the window", "chai with Dadi").
function imagery(lyrics: string): string {
  return lyrics
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^\[.*\]$/.test(l))
    .slice(0, 3)
    .join(" / ")
    .slice(0, 240);
}

export function coverPrompt(s: CoverSong): string {
  const genre = findGenre(s.genre);
  return [
    // The title itself is left out: image models paint it as misspelt lettering.
    "Square album cover art, a painted scene",
    genre ? `${genre.label} music` : "",
    s.mood ? `${s.mood} feeling` : "",
    imagery(s.lyrics) ? `inspired by: ${imagery(s.lyrics)}` : "",
    "bold vivid colours, saffron, marigold and deep plum, rich illustrated poster style, cinematic lighting, one strong central image",
    "no text, no letters, no words, no signs, no logos, no real or famous people",
  ]
    .filter(Boolean)
    .join(", ");
}

export interface CoverDeps {
  image: ImageProvider;
  ffmpeg: (args: string[]) => Promise<void>;
}

// Writes a 768x768 JPEG to `outFile`: the picture centre-cropped to a square, whatever shape the model made.
// ffmpeg reads the provider's https:// URLs directly; a local file:// picture is removed afterwards.
export async function makeCover(deps: CoverDeps, song: CoverSong, outFile: string, seed?: number): Promise<string> {
  const { url } = await deps.image.generateKeyframe({ prompt: coverPrompt(song), referenceImageUrls: [], seed });
  const src = url.startsWith("file://") ? fileURLToPath(url) : url;
  try {
    await deps.ffmpeg(["-y", "-i", src, "-vf", "crop='min(iw,ih)':'min(iw,ih)',scale=768:768", "-frames:v", "1", "-q:v", "3", outFile]);
  } finally {
    if (src !== url) await rm(src, { force: true });
  }
  return outFile;
}
