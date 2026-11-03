import { z } from "zod";
import { writeInRule } from "@/lib/languages";
import type { NarrationLanguage } from "@/lib/providers/types";

// A dance reel: cartoon kids dance to a dhol beat while a voice chants the lines on the beat.
// Everything is drawn and synthesised by Reelkar, so it needs no image, video or music models.

export const DANCE_MOVES = ["bounce", "clap", "wave", "spin", "jump", "twist"] as const;
export type DanceMove = (typeof DANCE_MOVES)[number];
export const DANCE_SCENES = ["courtyard", "park", "stage"] as const;
export const SKIN_TONES = ["light", "medium", "deep"] as const;
export const OUTFITS = ["kurta", "lehenga", "frock", "shirt"] as const;
export const HAIR = ["short", "curly", "ponytails", "bun", "plait"] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const dancerSchema = z.object({
  name: z.string().trim().min(1).max(20),
  skin: z.enum(SKIN_TONES).catch("medium"),
  outfit: z.enum(OUTFITS).catch("kurta"),
  color: hex.catch("#ffb21a"),
  hair: z.enum(HAIR).catch("short"),
});

export const danceScriptSchema = z.object({
  title: z.string().trim().min(1).max(80),
  language: z.string().trim().min(2).max(10),
  bpm: z.coerce.number().int().min(90).max(140).catch(118),
  scene: z.enum(DANCE_SCENES).catch("courtyard"),
  dancers: z.array(dancerSchema).min(1).max(4),
  // Chant lines in order; they repeat like a chorus until the reel is full.
  lines: z.array(z.object({ text: z.string().trim().min(1).max(70), move: z.enum(DANCE_MOVES).catch("bounce") })).min(1).max(8),
});

// How the chant is voiced. "sung" (the default, free) sings the TTS voice to a simple tune on the beat;
// "chant" speaks it on the beat; "ai_song" has ACE-Step sing it as a real song, which costs credits.
// It is a request option rather than part of the script, so a script the LLM writes can never pick a paid voice.
export const DANCE_VOICES = ["sung", "chant", "ai_song"] as const;
export type DanceVoice = (typeof DANCE_VOICES)[number];

export type Dancer = z.infer<typeof dancerSchema>;
export type DanceScript = z.infer<typeof danceScriptSchema>;

export function buildDancePrompt({ story, language = "auto" }: { story: string; language?: NarrationLanguage }): string {
  const lang =
    language === "auto"
      ? "Detect the idea's language and write the chant in it, in its native script; set `language` to its ISO 639-1 code."
      : `${writeInRule(language)} Use it for the chant. Set \`language\` to "${language}".`;
  return [
    "You write short dance reels for young children: cartoon kids dance to a dhol beat while a voice chants on the beat.",
    lang,
    "Write 3-5 chant lines. Each line is short and bouncy (3-7 words), easy for kids to repeat, with a catchy sound hook",
    "(like 'dubi dubi dum dum' or 'chak chak chak') that you make up yourself. Never copy lyrics from existing songs.",
    `Give each line one dance move: ${DANCE_MOVES.join(", ")}. Use "jump" for the last line.`,
    `Pick 2-3 dancers, Indian kids with Indian names. For each: skin (${SKIN_TONES.join("|")}), outfit (${OUTFITS.join("|")}), color (a bright hex colour, different for each), hair (${HAIR.join("|")}).`,
    `Pick a scene (${DANCE_SCENES.join("|")}) and a tempo (bpm 100-130).`,
    "Everything gentle, happy and safe for young children.",
    'Reply with JSON only: {"title":string,"language":string,"bpm":number,"scene":string,"dancers":[{"name","skin","outfit","color","hair"}],"lines":[{"text","move"}]}',
    "",
    "Idea:",
    story,
  ].join("\n");
}

export interface Segment {
  // -1 is the intro (title on screen, kids bounce) and -2 the finale (everyone jumps).
  line: number;
  move: DanceMove;
  start: number;
  end: number;
  // When the chant's words are heard, in seconds from the segment's start (sung voices only).
  words?: WordTime[];
}

export interface WordTime {
  start: number;
  end: number;
}

export const beatSec = (bpm: number) => 60 / bpm;

// Lays the chant out on the beat: a one-bar intro, then each line for as long as its voice needs,
// repeating the lines until the reel is full, and a finale of at least a bar. Always exactly durationSec.
export function planDance(script: DanceScript, spoken: number[], durationSec: number): Segment[] {
  const bar = beatSec(script.bpm) * 4;
  const segments: Segment[] = [{ line: -1, move: "bounce", start: 0, end: bar }];
  let t = bar;
  const finaleStart = durationSec - bar;
  // Lines snap to half bars (two beats), so short and long lines both land on the beat.
  const half = bar / 2;
  for (let i = 0; ; i = (i + 1) % script.lines.length) {
    const bars = Math.max(2, Math.ceil(((spoken[i] ?? 0) + 0.2) / half)) / 2;
    if (t + bars * bar > finaleStart + 1e-6) {
      // A very long first line still gets sung, cut at the finale, rather than leaving the reel silent.
      if (segments.length === 1 && finaleStart > t) {
        segments.push({ line: i, move: script.lines[i].move, start: t, end: finaleStart });
        t = finaleStart;
      }
      break;
    }
    segments.push({ line: i, move: script.lines[i].move, start: t, end: t + bars * bar });
    t += bars * bar;
  }
  // Any leftover time goes to the finale, so the reel ends on the beat with everyone jumping.
  segments.push({ line: -2, move: "jump", start: t, end: durationSec });
  return segments;
}
