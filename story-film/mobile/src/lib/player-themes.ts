import { useEffect, useState } from "react";

import { useSession } from "./session";
import { getItem, setItem } from "./storage";

// How a theme's particles move: dust rising, rain falling, club sparks flying out, gold flakes tumbling.
export type ParticleKind = "rise" | "rain" | "radiate" | "tumble";

export interface PlayerTheme {
  id: "diya" | "monsoon" | "neon" | "haldi";
  name: string;
  hint: string;
  // Background gradient top to bottom, and the glow behind the cover.
  sky: [string, string, string];
  glow: string;
  particles: string[];
  kind: ParticleKind;
  count: number;
  // Played part of the waveform and the play button.
  accent: string;
  onAccent: string;
}

export const PLAYER_THEMES: PlayerTheme[] = [
  {
    id: "diya",
    name: "Diya",
    hint: "Warm glow",
    sky: ["#5b1f2a", "#2a1235", "#150a1a"],
    glow: "#ff7a1a",
    particles: ["#ffb21a", "#ff7a1a", "#fff1e6", "#ffc23d"],
    kind: "rise",
    count: 56,
    accent: "#ffb21a",
    onAccent: "#2a1235",
  },
  {
    id: "monsoon",
    name: "Monsoon",
    hint: "Rain",
    sky: ["#0d3b4a", "#12203a", "#0a0f1f"],
    glow: "#2bf0b5",
    particles: ["#9fe8ff", "#2bf0b5", "#e6f7ff", "#6cc7e8"],
    kind: "rain",
    count: 64,
    accent: "#2bf0b5",
    onAccent: "#062b22",
  },
  {
    id: "neon",
    name: "Neon",
    hint: "Club",
    sky: ["#3a0b4a", "#1a0b2e", "#08040f"],
    glow: "#ff3df0",
    particles: ["#ff3df0", "#2bf0ff", "#b26bff", "#fff1e6"],
    kind: "radiate",
    count: 60,
    accent: "#ff3df0",
    onAccent: "#1a0b2e",
  },
  {
    id: "haldi",
    name: "Haldi",
    hint: "Gold",
    sky: ["#6b4205", "#3a2205", "#170d02"],
    glow: "#ffc23d",
    particles: ["#ffd76b", "#ffb21a", "#fff1c2", "#e89a10"],
    kind: "tumble",
    count: 48,
    accent: "#ffc23d",
    onAccent: "#2a1235",
  },
];

export const themeById = (id: string | null | undefined) => PLAYER_THEMES.find((t) => t.id === id) ?? PLAYER_THEMES[0];

// The player theme this person picked, remembered on this phone.
export function usePlayerTheme(): [PlayerTheme, (id: PlayerTheme["id"]) => void] {
  const { user } = useSession();
  const key = `reelkar.playerTheme.${(user?.id ?? "anon").replace(/[^\w.-]/g, "")}`;
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    getItem(key)
      .then((v) => live && setId(v))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [key]);
  return [
    themeById(id),
    (next) => {
      setId(next);
      setItem(key, next).catch(() => undefined);
    },
  ];
}
