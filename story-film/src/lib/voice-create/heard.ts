import { z } from "zod";
import { LANGUAGE_CODES } from "@/lib/languages";
import type { TimedWord } from "@/lib/providers/whisper";
import { GENRES, MOODS } from "@/lib/songs/styles";

// "Just hum it": one recording, and Reelkar works out what it was.
// hum: a tune with no words; sing: a tune with words; speech: the creator saying what they want.
export const HEARD_KINDS = ["hum", "sing", "speech"] as const;
export type HeardKind = (typeof HEARD_KINDS)[number];

export const MAKE_KINDS = ["song", "reel", "music_video"] as const;
export type MakeKind = (typeof MAKE_KINDS)[number];

const LANGS = [...LANGUAGE_CODES, "hinglish"] as const;

// What Reelkar will make. The creator sees and can change all of it before anything is charged.
export const planSchema = z.object({
  make: z.enum(MAKE_KINDS).default("song"),
  topic: z.string().trim().max(300).default(""),
  title: z.string().trim().max(80).default(""),
  genre: z.enum(GENRES.map((g) => g.id) as [string, ...string[]]).catch("bollywood-romantic"),
  mood: z.enum(MOODS).or(z.literal("")).catch(""),
  language: z.enum(LANGS).catch("hi"),
  durationSec: z.number().int().min(15).max(120).catch(30),
  // The lines the creator sang (sing) or asked for (speech), cleaned up.
  lyrics: z.string().trim().max(3000).default(""),
});
export type Plan = z.infer<typeof planSchema>;

export interface Heard {
  kind: HeardKind;
  transcript: string;
  plan: Plan;
}

// Whisper "hears" words in humming: syllables like "hmm" and "la la", or a stock phrase it makes
// up for wordless audio. Those count as no words.
const HUM_SYLLABLE = /^(h*m+|hm+|mm+h*|uh+|ah+|oh+|o+|a+|la+|na+|da+|ta+|du+|doo+|dum+|ra+|ri+|re+|ba+|pa+|♪+|[.,!?…-]+)$/i;
const WHISPER_FILLERS = [
  /^thank you( for watching)?[.!]?$/i,
  /^thanks for watching[.!]?$/i,
  /^(please )?subscribe[.!]?$/i,
  /^you$/i,
  /^\[?(music|humming|singing|silence|blank_audio)\]?$/i,
  /^\(?(music|humming|singing)\)?$/i,
];

export function meaningfulWords(transcript: string): string[] {
  const text = transcript.trim();
  if (WHISPER_FILLERS.some((r) => r.test(text))) return [];
  return text
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}♪]+|[^\p{L}\p{N}♪]+$/gu, ""))
    .filter((w) => w && !HUM_SYLLABLE.test(w));
}

// Speech runs at ~2–3.5 words a second; singing stretches words, so it's slower, with long held words.
export function wordsPerSecond(words: TimedWord[], durationSec: number): number {
  if (words.length === 0) return 0;
  const span = Math.max(1, (words.at(-1)!.end - words[0].start) || durationSec);
  return words.length / span;
}

export function longHeldWords(words: TimedWord[]): number {
  if (words.length === 0) return 0;
  return words.filter((w) => w.end - w.start > 0.9).length / words.length;
}

const REQUEST_WORDS = /\b(make|create|write|generate|want|need|song about|reel about|video about|banao|bana do|banaiye|chahiye|likho|gaana|gana)\b|बनाओ|बना दो|चाहिए|लिखो|गाना/i;

// A first guess without the AI, used when the AI is unavailable or unsure.
export function guessKind(transcript: string, words: TimedWord[], durationSec: number): HeardKind {
  const said = meaningfulWords(transcript);
  if (said.length < 3) return "hum";
  if (REQUEST_WORDS.test(transcript)) return "speech";
  const wps = wordsPerSecond(words, durationSec);
  if (words.length >= 3 && (wps < 1.6 || longHeldWords(words) > 0.25)) return "sing";
  return "speech";
}

export function buildHeardPrompt(transcript: string, guess: HeardKind, stats: { durationSec: number; wordsPerSecond: number }): string {
  return [
    "You help creators on Reelkar, an app that makes songs, short reels and music videos for Indian and Gulf creators.",
    "A creator pressed the mic and either hummed a tune, sang a few lines, or said what they want made. Here is the speech-to-text of the recording:",
    `"""${transcript.slice(0, 2000)}"""`,
    `Recording: ${stats.durationSec.toFixed(1)} s, about ${stats.wordsPerSecond.toFixed(1)} words per second (speech is usually 2-3.5, singing slower). First guess: ${guess}.`,
    'Decide "kind": "sing" if these are sung song lines (lyrics), "speech" if they are describing or asking for something to be made, "hum" if there are no real words.',
    'Then fill in a plan. "make": "song" unless they ask for a reel/short video ("reel") or a music video ("music_video"). Sung or hummed recordings are always "song".',
    '"topic": what it is about, in a short phrase in English. "title": a short catchy title in the language of the song.',
    `"genre": one of ${GENRES.map((g) => g.id).join(", ")}. Pick the closest to what they asked or what the lyrics feel like.`,
    `"mood": one of ${MOODS.join(", ")}, or "". "language": one of ${LANGS.join(", ")} (hinglish = Hindi in Latin letters mixed with English).`,
    '"durationSec": the length they asked for, else 30 for a reel and 60 for a song.',
    '"lyrics": for "sing", the sung lines cleaned up, one per line, in the script they were sung in; for "speech", any lines they asked to include; else "".',
    'Reply with JSON only: {"kind": string, "plan": {"make": string, "topic": string, "title": string, "genre": string, "mood": string, "language": string, "durationSec": number, "lyrics": string}}',
  ].join("\n");
}

const replySchema = z.object({ kind: z.enum(HEARD_KINDS).catch("speech"), plan: planSchema.catch(() => planSchema.parse({})) });

export function defaultPlan(kind: HeardKind, transcript: string): Plan {
  return planSchema.parse({
    make: "song",
    topic: kind === "speech" ? transcript.slice(0, 300) : "",
    lyrics: kind === "sing" ? transcript.slice(0, 3000) : "",
    durationSec: 60,
  });
}

// What Reelkar heard. Without words it's a hum and the AI isn't asked.
export async function understand(
  llm: { completeJson(prompt: string): Promise<unknown> } | undefined,
  input: { transcript: string; words: TimedWord[]; durationSec: number; typed?: boolean },
): Promise<Heard> {
  const transcript = input.transcript.trim();
  // Typed or handed over by Siri / another app: always a request.
  const guess = input.typed ? "speech" : guessKind(transcript, input.words, input.durationSec);
  if (guess === "hum" || !llm) return { kind: guess, transcript: guess === "hum" ? "" : transcript, plan: defaultPlan(guess, transcript) };
  try {
    const reply = replySchema.parse(
      await llm.completeJson(buildHeardPrompt(transcript, guess, { durationSec: input.durationSec, wordsPerSecond: wordsPerSecond(input.words, input.durationSec) })),
    );
    const kind = input.typed ? "speech" : reply.kind === "hum" ? guess : reply.kind;
    const plan = kind === "speech" ? reply.plan : { ...reply.plan, make: "song" as const, lyrics: reply.plan.lyrics || transcript };
    return { kind, transcript, plan };
  } catch (err) {
    console.warn(`Couldn't understand the recording with the AI, using the first guess: ${(err as Error).message.slice(0, 200)}`);
    return { kind: guess, transcript, plan: defaultPlan(guess, transcript) };
  }
}
