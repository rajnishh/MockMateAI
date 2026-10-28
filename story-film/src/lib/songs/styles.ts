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
  { id: "sufi", label: "Sufi", prompt: "Sufi qawwali inspired, harmonium, claps, soulful powerful vocals" },
];

export const MOODS = ["happy", "romantic", "sad", "energetic", "peaceful", "funny", "motivational"] as const;

export function findGenre(id: string): Genre | undefined {
  return GENRES.find((g) => g.id === id);
}

export function stylePrompt(genre: Genre, mood: string): string {
  return `${genre.prompt}${mood ? `, ${mood} mood` : ""}`.slice(0, 512);
}
