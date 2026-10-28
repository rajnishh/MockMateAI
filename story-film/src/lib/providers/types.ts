import type { LanguageCode } from "@/lib/languages";

export type FilmStyle = "cinematic" | "animated" | "photoreal";
export type Resolution = "480p" | "720p";
// "auto" keeps the language the user wrote in.
export type NarrationLanguage = "auto" | LanguageCode;

export interface Character {
  name: string;
  description: string;
}

export interface Shot {
  narration: string;
  imagePrompt: string;
  motionPrompt: string;
}

export interface FilmScript {
  title: string;
  language: string;
  characters: Character[];
  shots: Shot[];
  musicPrompt: string;
}

// A saved, reusable character. Its description is repeated in every image
// prompt and its reference image (and seed) keep the look consistent.
export interface CharacterProfile {
  name: string;
  description: string;
  referenceImageUrl: string;
  seed: number;
}

export interface ScriptRequest {
  story: string;
  style: FilmStyle;
  shotCount: number;
  character?: CharacterProfile;
  kidSafe?: boolean;
  language?: NarrationLanguage;
}

export interface LlmProvider {
  readonly modelId: string;
  writeScript(input: ScriptRequest): Promise<FilmScript>;
  completeJson(prompt: string): Promise<unknown>;
}

// URLs are either https:// (hosted providers) or file:// (local media store).
export interface ImageProvider {
  readonly modelId: string;
  generateKeyframe(input: { prompt: string; referenceImageUrls: string[]; seed?: number }): Promise<{ url: string }>;
}

export interface VideoProvider {
  readonly modelId: string;
  animate(input: { imageUrl: string; prompt: string; durationSec: number; resolution: Resolution }): Promise<{ url: string }>;
}

export interface TtsProvider {
  readonly modelId: string;
  speak(input: { text: string; language: string }): Promise<Buffer>;
}

export interface MusicProvider {
  readonly modelId: string;
  compose(input: { prompt: string; durationSec: number }): Promise<Buffer>;
}
