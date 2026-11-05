import type { PublicSongCard, Reaction, Song } from "./api";

// Listen helpers for the app (the server side is story-film/src/lib/listen.ts).

export const REACTIONS: { kind: Reaction; emoji: string; label: string }[] = [
  { kind: "fire", emoji: "🔥", label: "Fire" },
  { kind: "dance", emoji: "💃", label: "Dance" },
  { kind: "touched", emoji: "🥹", label: "Touched" },
  { kind: "haha", emoji: "😂", label: "Haha" },
  { kind: "respect", emoji: "🙏", label: "Respect" },
  { kind: "celebrate", emoji: "🎉", label: "Celebrate" },
];

// A public song as a Song, so the shared player, covers and the full player work unchanged.
// Its id is the public id (no dashes), which the player and analysis use to tell it apart.
export function publicTrackSong(c: PublicSongCard & { lyrics?: string | null }): Song {
  return {
    id: c.publicId,
    publicId: c.publicId,
    handle: c.handle,
    title: c.title,
    genre: c.genre,
    mood: c.mood,
    language: c.language,
    lyrics: c.lyrics ?? "",
    durationSec: c.durationSec,
    status: "completed",
    myVoice: c.ownVoice,
    edited: false,
    contentCredentials: false,
    error: null,
    createdAt: "",
    audioUrl: c.audioUrl || null,
    coverUrl: c.coverUrl,
  };
}

// Handles: what the server allows, so the sheet can say so before asking.
export function handleHint(raw: string): string | null {
  const h = raw.trim().toLowerCase().replace(/^@/, "");
  if (!h) return null;
  if (h.length < 3) return "Use at least 3 characters.";
  if (h.length > 20) return "Use 20 characters or fewer.";
  if (!/^[a-z0-9._]+$/.test(h)) return "Use letters a-z, numbers, dots and underscores.";
  if (/^[._]|[._]$|\.\./.test(h)) return "Start and end with a letter or number.";
  return null;
}

export const REPORT_REASONS: { value: "voice_or_likeness" | "copyright" | "hateful" | "minor_sexual" | "other"; label: string }[] = [
  { value: "voice_or_likeness", label: "It uses my voice or likeness without consent" },
  { value: "copyright", label: "Copyright" },
  { value: "hateful", label: "Hateful or abusive" },
  { value: "minor_sexual", label: "Sexual content involving a minor" },
  { value: "other", label: "Something else" },
];

export const plays = (n: number) => `${n.toLocaleString("en-IN")} ${n === 1 ? "play" : "plays"}`;
