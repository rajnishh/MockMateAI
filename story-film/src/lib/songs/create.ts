import type { LlmProvider } from "@/lib/providers/types";
import { type AceControls, experimentInputs, strictnessInputs } from "./controls";
import { cleanLyrics, writeLyrics } from "./lyrics";
import type { NewSongRequest } from "./request";
import { DEFAULT_STRUCTURE } from "./structure";
import { writeStyle } from "./style-writer";
import { type Genre, stylePrompt } from "./styles";

// What a Create turns into before it's queued: the words, the sound and the dials.
export interface PreparedSong {
  title: string;
  lyrics: string;
  style: string;
  controls: AceControls;
}

const INSTRUMENTAL = "[Instrumental]";

export function songControls(req: Pick<NewSongRequest, "model" | "mode" | "experiment" | "strictness" | "bpm" | "keyScale">): AceControls {
  // Simple mode keeps fal's own defaults; only Custom and Instrumental show the sliders.
  const dials = req.mode === "simple" ? {} : { ...experimentInputs(req.experiment), ...strictnessInputs(req.strictness) };
  return { ...(req.model === "ace-step" ? dials : {}), bpm: req.bpm, keyScale: req.keyScale };
}

// A title for an instrumental from its one-line idea: "rainy evening in Mumbai" -> "Rainy evening in Mumbai".
export function ideaTitle(topic: string, genre: Genre): string {
  const t = topic.trim().replace(/[.!?]+$/, "").slice(0, 60);
  return t ? t[0].toUpperCase() + t.slice(1) : `${genre.label} instrumental`;
}

// Simple mode asks AI for the title, lyrics and style; the others use what the creator wrote.
export async function prepareSong(llm: LlmProvider, req: NewSongRequest, genre: Genre): Promise<PreparedSong> {
  const controls = songControls(req);
  const duet = req.vocal === "duet";
  if (req.mode === "instrumental") {
    const sound = stylePrompt(genre, req.mood, "auto", req.style);
    return { title: req.title || ideaTitle(req.topic, genre), lyrics: INSTRUMENTAL, style: `${sound}, instrumental, no vocals`.slice(0, 512), controls };
  }
  if (req.mode === "custom") {
    return { title: req.title, lyrics: cleanLyrics(req.lyrics), style: stylePrompt(genre, req.mood, req.vocal, req.style), controls };
  }
  const options = { topic: req.topic, genre, mood: req.mood, language: req.language, durationSec: req.durationSec, kidSafe: req.kidSafe };
  const [written, style] = await Promise.all([
    writeLyrics(llm, { ...options, structure: req.structure?.length ? req.structure : DEFAULT_STRUCTURE, duet }),
    req.style ? Promise.resolve(req.style) : writeStyle(llm, { idea: req.topic, genre, mood: req.mood, vocal: req.vocal, language: req.language }),
  ]);
  return { title: req.title || written.title, lyrics: written.lyrics, style: stylePrompt(genre, "", req.vocal, style), controls };
}
