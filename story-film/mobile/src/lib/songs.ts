import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { api, type Song, type SongVocal } from "./api";
import { LANGUAGES } from "./languages";

// Mirrors story-film/src/lib/songs/styles.ts (ids must match the backend).
export const GENRES = [
  { value: "bollywood-romantic", label: "Bollywood romantic" },
  { value: "punjabi-pop", label: "Punjabi pop" },
  { value: "kids-rhyme", label: "Kids rhyme" },
  { value: "devotional", label: "Devotional / bhajan" },
  { value: "indie-acoustic", label: "Indie acoustic" },
  { value: "lofi", label: "Lo-fi chill" },
  { value: "desi-hip-hop", label: "Desi hip-hop" },
  { value: "pop", label: "Pop" },
  { value: "edm", label: "EDM" },
  { value: "sufi", label: "Sufi" },
  { value: "bhangra", label: "Bhangra" },
  { value: "garba", label: "Garba" },
  { value: "lofi-hindi", label: "Lo-fi Hindi" },
  { value: "qawwali", label: "Qawwali" },
  { value: "indie-pop", label: "Indie pop" },
  { value: "khaleeji", label: "Khaleeji" },
];

// The Style chips on Create: the Indian and Gulf presets first (mirrors FEATURED_GENRES on the backend).
const FEATURED = ["desi-hip-hop", "bollywood-romantic", "punjabi-pop", "bhangra", "sufi", "garba", "lofi-hindi", "khaleeji", "qawwali", "indie-pop"];
export const STYLE_PRESETS = [...FEATURED.map((id) => GENRES.find((g) => g.value === id)!), ...GENRES.filter((g) => !FEATURED.includes(g.value))];

export const MOODS = ["happy", "romantic", "sad", "energetic", "peaceful", "funny", "motivational"].map((m) => ({ value: m, label: m[0].toUpperCase() + m.slice(1) }));

export const VOCALS: { value: SongVocal; label: string }[] = [
  { value: "auto", label: "Any" },
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "duet", label: "Duet" },
];

export const STYLE_CHIPS = [
  "acoustic guitar", "piano", "strings", "tabla", "dhol", "harmonium", "flute", "sitar", "synths", "808 bass",
  "slow tempo", "mid tempo", "fast tempo", "soft", "powerful", "emotional", "dreamy", "groovy", "cinematic", "live band",
];

// Songs can also be sung in Hinglish (mostly Hindi words, written in Latin letters).
export const SONG_LANGUAGES = [...LANGUAGES.map((l) => ({ value: l.code as string, label: l.label as string })), { value: "hinglish", label: "Hinglish" }, { value: "pa", label: "ਪੰਜਾਬੀ" }];

export const genreLabel = (id: string) => GENRES.find((g) => g.value === id)?.label ?? id;

// Adds a style chip to the sound text once, comma-separated like the web app.
export function addStyleChip(style: string, chip: string): string {
  if (style.toLowerCase().includes(chip)) return style;
  return style.trim() ? `${style.trim().replace(/,$/, "")}, ${chip}` : chip;
}

export const songMaking = (s: Song) => s.status === "queued" || s.status === "running";

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// The song file into the cache, signed in with the session cookie. The server names the file after
// the song's title, so "Save to Files" and WhatsApp show a real name. Fetched every time, as edits are new songs.
async function downloadSong(song: Song): Promise<File> {
  const url = api.songAudioUrl(song);
  if (!url) throw new Error("This song isn't ready yet");
  const dir = new Directory(Paths.cache, `song-${song.id}`);
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true });
  return File.downloadFileAsync(url, dir, { headers: await api.videoHeaders() });
}

// The share sheet with the audio file itself: Save to Files, WhatsApp, AirDrop, Instagram.
export async function shareSong(song: Song): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this phone");
  const file = await downloadSong(song);
  await Sharing.shareAsync(file.uri, { mimeType: file.type || "audio/mpeg", dialogTitle: song.title });
}
