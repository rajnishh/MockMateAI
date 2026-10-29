// Visual looks for reels. The hint is appended to every image prompt.
// Indian art styles are traditional forms (several hold GI tags); we describe the
// look and never claim a reel is an authentic work by a traditional artist.
export const FILM_STYLES = [
  { id: "cinematic", label: "Cinematic", group: "look", hint: "cinematic film still, anamorphic lens, dramatic lighting, shallow depth of field" },
  { id: "animated", label: "3D cartoon", group: "look", hint: "high-quality 3D animated cartoon style, soft lighting, expressive characters, vibrant colors" },
  { id: "photoreal", label: "Realistic", group: "look", hint: "photorealistic, natural light, documentary look" },
  {
    id: "madhubani",
    label: "Madhubani",
    group: "indian",
    hint: "Madhubani (Mithila) folk painting style, flat colours, bold black outlines, intricate line patterns and borders, fish, peacock and lotus motifs, red, yellow, green and indigo natural pigments, handmade paper texture",
  },
  {
    id: "warli",
    label: "Warli",
    group: "indian",
    hint: "Warli tribal art style, white stick figures built from circles and triangles on a terracotta brown mud-wall background, simple geometric shapes, rhythmic patterns, no shading",
  },
  {
    id: "gond",
    label: "Gond",
    group: "indian",
    hint: "Gond tribal painting style, vivid colours, figures and animals filled with fine dots and dashes, stylised trees, decorative patterns, bright plain background",
  },
  {
    id: "pattachitra",
    label: "Pattachitra",
    group: "indian",
    hint: "Odisha Pattachitra scroll painting style, ornate decorative borders, figures with large almond eyes, rich red, yellow, white and black natural colours, fine linework, cloth canvas texture",
  },
  {
    id: "kalamkari",
    label: "Kalamkari",
    group: "indian",
    hint: "Kalamkari hand-painted textile art style, earthy natural dyes of indigo, madder red and ochre, detailed pen-drawn outlines, floral and narrative panels, cotton fabric texture",
  },
  {
    id: "miniature",
    label: "Miniature",
    group: "indian",
    hint: "Indian miniature painting style, Rajput and Mughal, fine detail, flat perspective, jewel-tone colours, gold accents, palace and garden settings, ornate border",
  },
  {
    id: "storybook",
    label: "Storybook",
    group: "indian",
    hint: "classic Indian storybook illustration, warm watercolour and ink, gentle expressive characters, village and forest settings, soft natural light, Panchatantra fable mood",
  },
] as const;

export type FilmStyle = (typeof FILM_STYLES)[number]["id"];
export const STYLE_IDS = FILM_STYLES.map((s) => s.id) as [FilmStyle, ...FilmStyle[]];
export const STYLE_HINTS = Object.fromEntries(FILM_STYLES.map((s) => [s.id, s.hint])) as Record<FilmStyle, string>;
