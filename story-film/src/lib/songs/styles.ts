// Genre presets: what the user picks, and the style prompt ACE-Step receives.
// Styles describe sound only; they never name real artists.
export interface Genre {
  id: string;
  label: string;
  prompt: string;
}

export const GENRES: Genre[] = [
  { id: "bollywood-romantic", label: "Bollywood romantic", prompt: "Bollywood romantic ballad, soft male and female vocals, strings, piano, tabla, emotional, cinematic" },
  { id: "punjabi-pop", label: "Punjabi pop", prompt: "Punjabi pop, energetic dhol beat, catchy hook, upbeat vocals, synths, dance" },
  { id: "kids-rhyme", label: "Kids rhyme", prompt: "children's nursery rhyme, cheerful, simple melody, bright xylophone and ukulele, clear friendly vocals, slow tempo" },
  { id: "devotional", label: "Devotional / bhajan", prompt: "Indian devotional bhajan, harmonium, tabla, bells, peaceful, warm vocals" },
  { id: "indie-acoustic", label: "Indie acoustic", prompt: "indie acoustic folk, guitar, gentle vocals, warm, intimate" },
  { id: "lofi", label: "Lo-fi chill", prompt: "lo-fi hip hop, mellow, vinyl crackle, soft piano, relaxed vocals" },
  { id: "desi-hip-hop", label: "Desi hip-hop", prompt: "Indian hip hop, punchy drums, deep bass, confident rap vocals" },
  { id: "pop", label: "Pop", prompt: "modern pop, catchy chorus, polished production, upbeat vocals" },
  { id: "edm", label: "EDM", prompt: "EDM, festival drop, big synth leads, four-on-the-floor, energetic vocals" },
  { id: "sufi", label: "Sufi", prompt: "Sufi folk, harmonium, rabab, soft percussion, soulful powerful vocals, spiritual" },
  { id: "bhangra", label: "Bhangra", prompt: "Punjabi bhangra, loud dhol and tumbi, chimta, call-and-response hook, high energy, festive" },
  { id: "garba", label: "Garba", prompt: "Gujarati garba, dandiya rhythm, dhol and shehnai, synth pads, festive Navratri dance, joyful vocals" },
  { id: "lofi-hindi", label: "Lo-fi Hindi", prompt: "Hindi lo-fi, slowed reverb feel, soft rhodes piano, vinyl crackle, gentle tabla loop, mellow intimate vocals" },
  { id: "qawwali", label: "Qawwali", prompt: "qawwali, harmonium, tabla, rhythmic hand claps, chorus responses, building intensity, powerful devotional vocals" },
  { id: "indie-pop", label: "Indie pop", prompt: "Indian indie pop, bright guitars, warm synths, catchy hook, breezy drums, youthful vocals" },
  { id: "khaleeji", label: "Khaleeji", prompt: "Khaleeji Gulf pop, oud, qanun, darbuka and khaleeji clap rhythm, Arabic vocals, festive" },
];

// Shown first in the Style chips: the presets Indian and Gulf creators reach for most.
export const FEATURED_GENRES = ["desi-hip-hop", "bollywood-romantic", "punjabi-pop", "bhangra", "sufi", "garba", "lofi-hindi", "khaleeji", "qawwali", "indie-pop"];

export const MOODS = ["happy", "romantic", "sad", "energetic", "peaceful", "funny", "motivational"] as const;

export function findGenre(id: string): Genre | undefined {
  return GENRES.find((g) => g.id === id);
}

export const VOCALS = ["auto", "female", "male", "duet"] as const;
export type Vocal = (typeof VOCALS)[number];

const VOCAL_PROMPTS: Record<Vocal, string> = {
  auto: "",
  female: "female lead vocals",
  male: "male lead vocals",
  duet: "male and female duet vocals",
};

// Quick tags the creator can tap to add to a style, like Suno's style chips. Sound only, never artists.
export const STYLE_CHIPS = [
  "acoustic guitar", "piano", "strings", "tabla", "dhol", "harmonium", "flute", "sitar", "synths", "808 bass",
  "slow tempo", "mid tempo", "fast tempo", "soft", "powerful", "emotional", "dreamy", "groovy", "cinematic", "live band",
] as const;

// The style ACE-Step receives: the creator's own style text (written or AI-enhanced) when there is one, else the genre preset.
// A preset sung by one voice: "male and female vocals" becomes one lead singer.
export function soloStyle(genre: Genre): Genre {
  return { ...genre, prompt: genre.prompt.replace(/\b(male and female|male and female duet|duet) vocals\b/i, "solo lead vocals") };
}

export function stylePrompt(genre: Genre, mood: string, vocal: Vocal = "auto", custom?: string): string {
  const base = custom?.trim() || genre.prompt;
  // The creator's style that already says "female vocals" doesn't need it twice; presets always get the choice.
  const voice = vocal !== "auto" && !new RegExp(`\\b${vocal}\\b`, "i").test(custom ?? "") ? VOCAL_PROMPTS[vocal] : "";
  const parts = [base, mood && !custom?.trim() ? `${mood} mood` : "", voice];
  return parts.filter(Boolean).join(", ").slice(0, 512);
}
