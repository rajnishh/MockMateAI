export type FilmStyle = "cinematic" | "animated" | "photoreal";
export type Resolution = "480p" | "720p";

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

export interface LlmProvider {
  writeScript(input: { story: string; style: FilmStyle; shotCount: number }): Promise<FilmScript>;
}

export interface ImageProvider {
  readonly modelId: string;
  generateKeyframe(input: { prompt: string; referenceImageUrls: string[] }): Promise<{ url: string }>;
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
