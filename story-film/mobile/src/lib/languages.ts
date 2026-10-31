// Reel languages the backend can narrate (story-film/src/lib/languages.ts).
export const LANGUAGES = [
  { code: "hi", label: "हिन्दी" },
  { code: "en", label: "English" },
  { code: "mr", label: "मराठी" },
  { code: "bn", label: "বাংলা" },
  { code: "ta", label: "தமிழ்" },
  { code: "te", label: "తెలుగు" },
  { code: "ar", label: "العربية" },
] as const;

export const NICHES = ["Cooking", "Kids stories", "Tech and AI", "Fitness", "Devotional", "Comedy", "Money tips", "Small business"] as const;
