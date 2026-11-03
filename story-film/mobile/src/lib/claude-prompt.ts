// "Build with Claude": a ready-to-send prompt that has Claude make this reel through the
// Reelkar connector. Keep in step with story-film/src/lib/claude-prompt.ts (tested there).
import type { Brand as BrandPrefs } from "./session";

export type ClaudeReelType = "film" | "cartoon" | "motion" | "dance";

export interface ClaudeReel {
  type: ClaudeReelType;
  idea: string;
  durationSec: number;
  // Leave out to use the idea's own language.
  language?: { code: string; name: string };
  brand?: BrandPrefs;
  // Picture style id for film and cartoon reels (see styles.ts in the same app).
  style?: string;
  kidSafe?: boolean;
  // Cartoon episodes: the creator's saved character, so every episode shows the same one.
  character?: { id: string; name: string; description: string };
}

const TYPE_LABEL: Record<ClaudeReelType, string> = {
  film: "Short film (narrated story with pictures)",
  cartoon: "Cartoon episode (narrated story with pictures, 3D cartoon look)",
  motion: "Motion reel (animated text, tips, lists and numbers with a voice-over)",
  dance: "Kids dance (cartoon kids dance to a dhol beat while a voice chants)",
};

const SHOTS: Record<number, number> = { 15: 3, 30: 6, 60: 12 };

function brandLine(b?: BrandPrefs): string {
  const parts = [
    b?.accent ? `accent colour ${b.accent}` : null,
    b?.background ? `${b.background} background` : null,
    b?.handle ? `handle ${b.handle}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "none set, pick colours that suit the idea";
}

function steps(r: ClaudeReel, lang: string): string[] {
  if (r.type === "dance")
    return [
      `Write an original, bouncy chant yourself and call make_dance_reel with durationSec ${r.durationSec} and language ${lang}. Make the dancers Indian kids${r.brand?.accent ? ` and dress one of them in my accent colour ${r.brand.accent}` : ""}.`,
    ];
  if (r.type === "motion")
    return [
      `Write the slides yourself and call make_motion_reel_from_script: about ${Math.round(r.durationSec / 5)} slides for ${r.durationSec} seconds, narration in ${lang}. Use only real numbers.`,
    ];
  const shots = SHOTS[r.durationSec] ?? 6;
  return [
    `Write the script yourself and call make_reel_from_script with ${shots} shots (${r.durationSec} seconds), narration in ${lang}` +
      `${r.style ? `, style "${r.style}"` : ""}${r.kidSafe ? " and kidSafe true" : ""}. Describe each recurring character the same way in every shot.`,
    ...(r.character
      ? [`The main character is my saved character ${r.character.name}: ${r.character.description}. Pass characterId "${r.character.id}" and describe ${r.character.name} exactly like that in every shot they appear in.`]
      : []),
  ];
}

export function buildClaudePrompt(r: ClaudeReel): string {
  const lang = r.language ? `"${r.language.code}"` : "the idea's own language";
  const all = [
    ...steps(r, lang),
    "Then call get_reel until the reel is ready (it takes a minute or two).",
    'Reply with the "Open in Reelkar" link from get_reel, plus the link to watch the video.',
  ];
  return [
    "Use the Reelkar connector to make this reel for me.",
    "",
    `Type: ${TYPE_LABEL[r.type]}`,
    `Idea: ${r.idea.trim() || "(suggest a good one for my audience)"}`,
    `Length: ${r.durationSec} seconds`,
    `Language: ${r.language ? `${r.language.name} (${r.language.code})` : "same as the idea"}`,
    `Brand look: ${brandLine(r.brand)}`,
    ...(r.kidSafe || r.type === "dance" ? ["Audience: young children, keep everything gentle and safe."] : []),
    "",
    "Steps:",
    ...all.map((s, i) => `${i + 1}. ${s}`),
  ].join("\n");
}

// Where the creator opens Claude. The web link fills in the prompt (and opens the Claude phone app
// on phones); the Desktop app's own claude:// link opens a new chat there. Claude in Chrome has
// no link a page can open, so for it the prompt is copied for the creator to paste.
export type ClaudeTarget = "web" | "desktop" | "chrome";

export function claudeUrl(prompt: string, target: Exclude<ClaudeTarget, "chrome"> = "web"): string {
  const base = target === "desktop" ? "claude://claude.ai/new" : "https://claude.ai/new";
  return `${base}?q=${encodeURIComponent(prompt)}`;
}
