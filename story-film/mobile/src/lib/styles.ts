// Mirrors story-film/src/lib/styles.ts (ids must match the backend).
export const LOOKS = [
  { value: "animated", label: "3D cartoon" },
  { value: "cinematic", label: "Short film" },
  { value: "photoreal", label: "Realistic" },
] as const;

export const INDIAN_ART = [
  { value: "madhubani", label: "Madhubani" },
  { value: "warli", label: "Warli" },
  { value: "gond", label: "Gond" },
  { value: "pattachitra", label: "Pattachitra" },
  { value: "kalamkari", label: "Kalamkari" },
  { value: "miniature", label: "Miniature" },
  { value: "storybook", label: "Storybook" },
] as const;

export type Style = (typeof LOOKS)[number]["value"] | (typeof INDIAN_ART)[number]["value"];
