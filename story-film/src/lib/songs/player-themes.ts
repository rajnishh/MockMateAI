// Player themes for the song player. Mirrored in mobile/src/lib/player-themes.ts (ids must match).
export type ParticleKind = "rise" | "rain" | "radiate" | "tumble";

export interface PlayerTheme {
  id: "diya" | "monsoon" | "neon" | "haldi";
  name: string;
  hint: string;
  sky: [string, string, string];
  glow: string;
  particles: string[];
  kind: ParticleKind;
  count: number;
  accent: string;
  onAccent: string;
}

export const PLAYER_THEMES: PlayerTheme[] = [
  { id: "diya", name: "Diya", hint: "Warm glow", sky: ["#5b1f2a", "#2a1235", "#150a1a"], glow: "#ff7a1a", particles: ["#ffb21a", "#ff7a1a", "#fff1e6", "#ffc23d"], kind: "rise", count: 90, accent: "#ffb21a", onAccent: "#2a1235" },
  { id: "monsoon", name: "Monsoon", hint: "Rain", sky: ["#0d3b4a", "#12203a", "#0a0f1f"], glow: "#2bf0b5", particles: ["#9fe8ff", "#2bf0b5", "#e6f7ff", "#6cc7e8"], kind: "rain", count: 110, accent: "#2bf0b5", onAccent: "#062b22" },
  { id: "neon", name: "Neon", hint: "Club", sky: ["#3a0b4a", "#1a0b2e", "#08040f"], glow: "#ff3df0", particles: ["#ff3df0", "#2bf0ff", "#b26bff", "#fff1e6"], kind: "radiate", count: 100, accent: "#ff3df0", onAccent: "#1a0b2e" },
  { id: "haldi", name: "Haldi", hint: "Gold", sky: ["#6b4205", "#3a2205", "#170d02"], glow: "#ffc23d", particles: ["#ffd76b", "#ffb21a", "#fff1c2", "#e89a10"], kind: "tumble", count: 60, accent: "#ffc23d", onAccent: "#2a1235" },
];

export const themeById = (id: string | null | undefined) => PLAYER_THEMES.find((t) => t.id === id) ?? PLAYER_THEMES[0];

// Beat hit at a time: the last beat's strength, fading over about 150 ms. 0 between songs.
export function beatPulse(beats: number[], strength: number[], sec: number): number {
  let lo = 0;
  let hi = beats.length - 1;
  let i = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= sec) {
      i = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return i < 0 ? 0 : (strength[i] ?? 1) * Math.exp(-(sec - beats[i]) * 7);
}

// The lyric line being sung at a time, or -1 before the first.
export function activeLine(lines: { start: number }[], sec: number): number {
  let active = -1;
  for (let i = 0; i < lines.length; i++) if (lines[i].start <= sec + 0.15) active = i;
  return active;
}
