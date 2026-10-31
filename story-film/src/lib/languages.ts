// Every language the app writes, speaks and captions in. Plain data so client
// components can import it too.
export type LanguageCode = "en" | "hi" | "mr" | "bn" | "ta" | "te" | "ar";

export interface Language {
  code: LanguageCode;
  name: string;
  native: string;
  script: string;
  // Which narration engine speaks it (see src/lib/providers/tts.ts).
  tts: "kokoro" | "sarvam" | "chatterbox";
  rtl?: boolean;
}

export const LANGUAGES: Language[] = [
  { code: "en", name: "English", native: "English", script: "Latin", tts: "kokoro" },
  { code: "hi", name: "Hindi", native: "हिन्दी", script: "Devanagari", tts: "kokoro" },
  { code: "mr", name: "Marathi", native: "मराठी", script: "Devanagari", tts: "sarvam" },
  { code: "bn", name: "Bengali", native: "বাংলা", script: "Bengali", tts: "sarvam" },
  { code: "ta", name: "Tamil", native: "தமிழ்", script: "Tamil", tts: "sarvam" },
  { code: "te", name: "Telugu", native: "తెలుగు", script: "Telugu", tts: "sarvam" },
  { code: "ar", name: "Arabic", native: "العربية", script: "Arabic", tts: "chatterbox", rtl: true },
];

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code) as [LanguageCode, ...LanguageCode[]];

export function findLanguage(code: string): Language | undefined {
  return LANGUAGES.find((l) => l.code === code);
}

// One instruction for any model writing in a language: native script, not transliteration.
export function writeInRule(code: string): string {
  const lang = findLanguage(code);
  if (!lang) return "Write in the same language as the input.";
  if (lang.code === "en") return "Write in simple, natural English.";
  return `Write in natural, everyday ${lang.name} using ${lang.script} script (not Latin letters).`;
}
