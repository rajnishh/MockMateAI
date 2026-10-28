import { randomInt } from "node:crypto";

// To add a voice, the user reads a consent statement containing a one-time code.
// The recording must contain that code, which shows it was recorded live for this
// account rather than lifted from someone else's video or a celebrity clip.
export function newConsentCode(): string {
  return Array.from({ length: 4 }, () => randomInt(1, 10)).join("");
}

export function consentStatement(code: string): string {
  return `This is my own voice. I agree to Story to Film using it to sing songs for my account. My code is ${code.split("").join(" ")}.`;
}

const DIGIT_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  एक: "1", दो: "2", तीन: "3", चार: "4", पांच: "5", पाँच: "5", छह: "6", छः: "6", सात: "7", आठ: "8", नौ: "9",
  ek: "1", do: "2", teen: "3", char: "4", chaar: "4", paanch: "5", panch: "5", chhe: "6", saat: "7", aath: "8", nau: "9",
};

// Reduces a transcript to the digits spoken, in order, whether Whisper wrote
// "4821", "four eight two one", "चार आठ दो एक" or Devanagari numerals.
export function spokenDigits(transcript: string): string {
  return transcript
    .toLowerCase()
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x966))
    // \p{M} keeps Devanagari vowel signs (matras) inside their word.
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .map((token) => (/^\d+$/.test(token) ? token : DIGIT_WORDS[token] ?? ""))
    .join("");
}

export function transcriptHasCode(transcript: string, code: string): boolean {
  return spokenDigits(transcript).includes(code);
}

export const SAMPLE_MIN_SEC = 10;
export const SAMPLE_MAX_SEC = 60;
