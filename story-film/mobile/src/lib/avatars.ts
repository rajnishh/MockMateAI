// The ready-made profile avatars: an emoji on a colour. The server stores only the key.
// src/lib/avatars.ts and mobile/src/lib/avatars.ts must stay identical; a test checks this.

export interface AvatarPreset {
  key: string;
  emoji: string;
  bg: string;
  label: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { key: "mic", emoji: "🎤", bg: "#ffd6e8", label: "Microphone" },
  { key: "headphones", emoji: "🎧", bg: "#d6f0ec", label: "Headphones" },
  { key: "camera", emoji: "🎬", bg: "#fde7c8", label: "Clapper board" },
  { key: "diya", emoji: "🪔", bg: "#ffe9a8", label: "Diya" },
  { key: "peacock", emoji: "🦚", bg: "#cfe8ff", label: "Peacock" },
  { key: "tiger", emoji: "🐯", bg: "#ffd9b8", label: "Tiger" },
  { key: "chai", emoji: "☕", bg: "#ead9c8", label: "Chai" },
  { key: "moon", emoji: "🌙", bg: "#e2dbff", label: "Moon" },
  { key: "mango", emoji: "🥭", bg: "#ffe3a3", label: "Mango" },
  { key: "camel", emoji: "🐪", bg: "#f3e2c4", label: "Camel" },
  { key: "lotus", emoji: "🪷", bg: "#ffd8e4", label: "Lotus" },
  { key: "star", emoji: "🌟", bg: "#fff1b8", label: "Star" },
];

export const findAvatar = (key: string | null | undefined): AvatarPreset | undefined => AVATAR_PRESETS.find((a) => a.key === key);
