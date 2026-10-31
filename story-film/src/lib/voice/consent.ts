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

const RAW_DIGIT_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  एक: "1", दो: "2", तीन: "3", चार: "4", पांच: "5", पाँच: "5", छह: "6", छः: "6", सात: "7", आठ: "8", नौ: "9",
  ek: "1", do: "2", teen: "3", char: "4", chaar: "4", paanch: "5", panch: "5", chhe: "6", saat: "7", aath: "8", nau: "9",
  // Marathi
  दोन: "2", पाच: "5", सहा: "6", नऊ: "9",
  // Bengali
  এক: "1", দুই: "2", তিন: "3", চার: "4", পাঁচ: "5", ছয়: "6", সাত: "7", আট: "8", নয়: "9",
  // Tamil
  ஒன்று: "1", இரண்டு: "2", மூன்று: "3", நான்கு: "4", ஐந்து: "5", ஆறு: "6", ஏழு: "7", எட்டு: "8", ஒன்பது: "9",
  // Telugu
  ఒకటి: "1", రెండు: "2", మూడు: "3", నాలుగు: "4", ఐదు: "5", ఆరు: "6", ఏడు: "7", ఎనిమిది: "8", తొమ్మిది: "9",
  // Arabic
  واحد: "1", اثنان: "2", اثنين: "2", ثلاثة: "3", اربعة: "4", أربعة: "4", خمسة: "5", ستة: "6", سبعة: "7", ثمانية: "8", تسعة: "9",
};

// Keys in NFC, matching the normalised transcript (Bengali য় has two encodings).
const DIGIT_WORDS: Record<string, string> = Object.fromEntries(
  Object.entries(RAW_DIGIT_WORDS).map(([word, digit]) => [word.normalize("NFC"), digit]),
);

// Native digit blocks whose zero is at these code points (Devanagari, Bengali,
// Telugu, Tamil, Arabic-Indic, Extended Arabic-Indic).
const DIGIT_ZEROS = [0x966, 0x9e6, 0xc66, 0xbe6, 0x660, 0x6f0];

function toAsciiDigits(text: string): string {
  return text.replace(/\p{Nd}/gu, (d) => {
    const cp = d.codePointAt(0)!;
    const zero = DIGIT_ZEROS.find((z) => cp >= z && cp <= z + 9);
    return zero === undefined ? d : String(cp - zero);
  });
}

// Reduces a transcript to the digits spoken, in order, whether Whisper wrote
// "4821", "four eight two one", "चार आठ दो एक", Tamil/Telugu/Bengali/Arabic
// number words, or native numerals.
export function spokenDigits(transcript: string): string {
  return transcript
    .toLowerCase()
    .normalize("NFC")
    .replace(/\p{Nd}/gu, (d) => toAsciiDigits(d))
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
