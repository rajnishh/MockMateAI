import { useMemo, useState } from "react";
import { type GestureResponderEvent, View } from "react-native";

import { formatTime } from "@/lib/songs";
import { Txt } from "./ui";

// Waveform bars to scrub with: drag or tap to jump; VoiceOver swipes up and down to move 10 s.
export function WaveformScrubber({
  peaks,
  time,
  duration,
  accent,
  onSeek,
}: {
  peaks: number[] | null;
  time: number;
  duration: number;
  accent: string;
  onSeek: (sec: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const count = Math.max(24, Math.floor(width / 5));
  const bars = useMemo(() => {
    if (!peaks?.length) return Array.from({ length: count }, (_, i) => 0.25 + 0.2 * Math.abs(Math.sin(i * 0.5)));
    return Array.from({ length: count }, (_, i) => {
      const from = Math.floor((i * peaks.length) / count);
      const to = Math.max(from + 1, Math.floor(((i + 1) * peaks.length) / count));
      let m = 0;
      for (let j = from; j < to; j++) m = Math.max(m, peaks[j] ?? 0);
      return m;
    });
  }, [peaks, count]);

  const shown = drag ?? (duration ? time / duration : 0);
  const at = (e: GestureResponderEvent) => Math.min(1, Math.max(0, e.nativeEvent.locationX / Math.max(1, width)));
  return (
    <View style={{ gap: 6 }}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Song position"
        accessibilityValue={{ text: `${formatTime(shown * duration)} of ${formatTime(duration)}` }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => onSeek(time + (e.nativeEvent.actionName === "increment" ? 10 : -10))}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => setDrag(at(e))}
        onResponderMove={(e) => setDrag(at(e))}
        onResponderRelease={(e) => {
          onSeek(at(e) * duration);
          setDrag(null);
        }}
        onResponderTerminate={() => setDrag(null)}
        style={{ height: 48, flexDirection: "row", alignItems: "center", gap: 2 }}>
        {bars.map((v, i) => (
          <View
            key={i}
            pointerEvents="none"
            style={{ flex: 1, height: `${Math.round(18 + v * 82)}%`, borderRadius: 2, backgroundColor: i / bars.length < shown ? accent : "rgba(255, 241, 230, 0.22)" }}
          />
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Txt variant="mono" style={{ color: "rgba(255, 241, 230, 0.75)" }}>
          {formatTime(shown * duration)}
        </Txt>
        <Txt variant="mono" style={{ color: "rgba(255, 241, 230, 0.75)" }}>
          {formatTime(duration)}
        </Txt>
      </View>
    </View>
  );
}
