import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop, Text as SvgText } from "react-native-svg";

import { API_URL } from "@/lib/config";
import { api, type Song } from "@/lib/api";
import { fonts } from "@/theme";

// Masala Pop pairs for songs without AI cover art yet.
const PAIRS: [string, string, string][] = [
  ["#ffb21a", "#ff4d2e", "#2a1235"],
  ["#14d9a0", "#0a7a58", "#2a1235"],
  ["#ff7a1a", "#5b1f4f", "#ffb21a"],
  ["#ffc23d", "#ff7a1a", "#2bf0b5"],
  ["#ff5a3c", "#2e1a36", "#ffb21a"],
  ["#2bf0b5", "#2a1235", "#ff7a1a"],
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// The cover link when the server has made one (the song-create work adds `coverUrl`).
export function coverUri(song: Song): string | null {
  const url = (song as Song & { coverUrl?: string | null }).coverUrl;
  if (!url) return null;
  return /^https?:/.test(url) ? url : `${API_URL}${url}`;
}

// Square cover art: the AI picture when there is one, else a gradient made from the song id.
export function SongCover({ song, size, radius = 12 }: { song: Song; size: number; radius?: number }) {
  const uri = coverUri(song);
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (uri) api.videoHeaders().then(setHeaders).catch(() => setHeaders({}));
  }, [uri]);

  if (uri && !failed) {
    return (
      <View style={{ width: size, height: size, borderRadius: radius, overflow: "hidden", backgroundColor: "#2a1235" }}>
        {headers ? <Image source={{ uri, headers }} style={{ width: size, height: size }} onError={() => setFailed(true)} accessibilityIgnoresInvertColors /> : null}
      </View>
    );
  }
  return <GradientCover id={song.id} title={song.title} size={size} radius={radius} />;
}

function GradientCover({ id, title, size, radius }: { id: string; title: string; size: number; radius: number }) {
  const h = hash(id);
  const [a, b, ring] = PAIRS[h % PAIRS.length];
  const cx = 20 + ((h >> 4) % 60);
  const cy = 20 + ((h >> 10) % 50);
  const letter = (title.trim()[0] ?? "♪").toUpperCase();
  const g = `g${h}`;
  const r = `r${h}`;
  return (
    <View style={{ width: size, height: size, borderRadius: radius, overflow: "hidden" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id={g} x1="0" y1="0" x2={(h & 1) === 0 ? "1" : "0.3"} y2="1">
            <Stop offset="0" stopColor={a} />
            <Stop offset="1" stopColor={b} />
          </LinearGradient>
          <RadialGradient id={r} cx={cx} cy={cy} r="45" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#fff7ee" stopOpacity="0.55" />
            <Stop offset="1" stopColor="#fff7ee" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100" height="100" fill={`url(#${g})`} />
        <Rect width="100" height="100" fill={`url(#${r})`} />
        {[34, 26, 18].map((rad, i) => (
          <Circle key={rad} cx={100 - cx * 0.6} cy={100 - cy * 0.5} r={rad} fill="none" stroke={ring} strokeOpacity={0.35 - i * 0.08} strokeWidth={2.2} />
        ))}
        <SvgText x="9" y="91" fontSize="38" fontFamily={fonts.extrabold} fill="#fff7ee" fillOpacity="0.92">
          {letter}
        </SvgText>
      </Svg>
    </View>
  );
}
