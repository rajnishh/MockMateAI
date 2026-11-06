import { useLayoutEffect, useRef, useState } from "react";
import { PanResponder, StyleSheet, View, type GestureResponderEvent } from "react-native";

import { formatTime } from "@/lib/songs";
import { radius, useTheme } from "@/theme";
import { Txt } from "./ui";

export interface Range {
  start: number;
  end: number;
}

const HANDLE = 44;
const round = (x: number) => Math.round(x * 10) / 10;

// Keeps a part inside the song and between minSec and maxSec long, moving only the edge being dragged.
export function clampRange(r: Range, moving: "start" | "end" | "move", dur: number, minSec: number, maxSec: number): Range {
  if (moving === "move") {
    const len = r.end - r.start;
    const start = Math.min(dur - len, Math.max(0, r.start));
    return { start: round(start), end: round(start + len) };
  }
  if (moving === "start") return { start: round(Math.max(0, r.end - maxSec, Math.min(r.end - minSec, r.start))), end: r.end };
  return { start: r.start, end: round(Math.min(dur, r.start + maxSec, Math.max(r.start + minSec, r.end))) };
}

// The song's waveform from the server's peaks, with a playhead and optionally a part to pick.
// Drag either edge (44 pt targets) or the part itself; with VoiceOver, swipe up or down on an edge.
export function Waveform({
  peaks,
  durationSec: dur,
  position,
  range,
  onRange,
  onSeek,
  minSec = 1,
  maxSec = dur,
  label = "Part",
  height = 64,
  onDeep,
}: {
  peaks: number[] | null;
  durationSec: number;
  position?: number;
  range?: Range;
  onRange?: (r: Range) => void;
  onSeek?: (sec: number) => void;
  minSec?: number;
  maxSec?: number;
  label?: string;
  height?: number;
  // Drawn on the plum player card.
  onDeep?: boolean;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  // Gestures are made once, so they read the latest values from here.
  const live = useRef({ width, range, onRange, dur, minSec, maxSec });
  useLayoutEffect(() => {
    live.current = { width, range, onRange, dur, minSec, maxSec };
  });
  const bars = peaks ?? Array.from({ length: 80 }, (_, i) => 0.25 + 0.15 * Math.sin(i / 3));

  const responder = (kind: "start" | "end" | "move") => {
    let r0: Range | undefined;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // The page mustn't scroll away mid-drag.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        r0 = live.current.range;
      },
      onPanResponderMove: (_e, g) => {
        const { width: w, onRange: set, dur: d, minSec: lo, maxSec: hi } = live.current;
        if (!r0 || !set || !w) return;
        const delta = (g.dx / w) * d;
        const r = kind === "start" ? { ...r0, start: r0.start + delta } : kind === "end" ? { ...r0, end: r0.end + delta } : { start: r0.start + delta, end: r0.end + delta };
        set(clampRange(r, kind, d, lo, hi));
      },
    });
  };
  // The handlers read the refs only inside touch callbacks, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [pans] = useState(() => ({ start: responder("start"), end: responder("end"), move: responder("move") }));

  const x = (sec: number) => (Math.min(dur, Math.max(0, sec)) / dur) * width;
  const lit = (i: number) => {
    const at = ((i + 0.5) / bars.length) * dur;
    return range ? at >= range.start && at <= range.end : position !== undefined && at <= position;
  };
  const barOn = onDeep ? colors.pop : colors.action;
  const barOff = onDeep ? "rgba(255,255,255,0.28)" : colors.lineStrong;

  const nudge = (edge: "start" | "end", by: number) => range && onRange?.(clampRange({ ...range, [edge]: range[edge] + by }, edge, dur, minSec, maxSec));

  const seek = (e: GestureResponderEvent) => onSeek && width && onSeek(Math.min(dur, Math.max(0, (e.nativeEvent.locationX / width) * dur)));

  return (
    <View>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ height, justifyContent: "center" }}
        onStartShouldSetResponder={() => Boolean(onSeek)}
        onResponderRelease={seek}
        accessible={Boolean(onSeek) && !range}
        accessibilityRole={onSeek && !range ? "adjustable" : undefined}
        accessibilityLabel={onSeek && !range ? "Song position" : undefined}
        accessibilityValue={onSeek && !range ? { text: `${formatTime(position ?? 0)} of ${formatTime(dur)}` } : undefined}
        accessibilityActions={onSeek && !range ? [{ name: "increment" }, { name: "decrement" }] : undefined}
        onAccessibilityAction={(e) => onSeek?.(Math.min(dur, Math.max(0, (position ?? 0) + (e.nativeEvent.actionName === "increment" ? 5 : -5))))}>
        <View style={styles.bars} pointerEvents="none" importantForAccessibility="no-hide-descendants">
          {bars.map((p, i) => (
            <View key={i} style={[styles.bar, { height: Math.max(3, p * (height - 8)), backgroundColor: lit(i) ? barOn : barOff, opacity: lit(i) ? 1 : 0.6 }]} />
          ))}
        </View>
        {position !== undefined && width > 0 ? <View pointerEvents="none" style={[styles.playhead, { left: x(position) - 1, backgroundColor: onDeep ? colors.onDeep : colors.ink }]} /> : null}
        {range && width > 0 ? (
          <>
            <View
              {...pans.move.panHandlers}
              accessible={false}
              style={[styles.part, { left: x(range.start), width: Math.max(0, x(range.end) - x(range.start)), borderColor: colors.action, backgroundColor: `${colors.action}22` }]}
            />
            {(["start", "end"] as const).map((edge) => (
              <View
                key={edge}
                {...pans[edge].panHandlers}
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel={`${label} ${edge}`}
                accessibilityHint="Swipe up or down to move it by a second"
                accessibilityValue={{ text: formatTime(range[edge]) }}
                accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
                onAccessibilityAction={(e) => nudge(edge, e.nativeEvent.actionName === "increment" ? 1 : -1)}
                hitSlop={{ top: 8, bottom: 8 }}
                style={[styles.handle, { left: x(range[edge]) - HANDLE / 2 }]}>
                <View style={[styles.grip, { backgroundColor: colors.action }]}>
                  <View style={[styles.gripLine, { backgroundColor: colors.onAction }]} />
                </View>
              </View>
            ))}
          </>
        ) : null}
      </View>
      <View style={styles.times}>
        {range ? (
          <>
            <Txt variant="mono" color={onDeep ? "onDeep" : "inkMuted"}>{formatTime(range.start)}</Txt>
            <Txt variant="label" color={onDeep ? "onDeep" : "ink"} style={{ fontSize: 13 }}>{`${label} · ${round(range.end - range.start)} s`}</Txt>
            <Txt variant="mono" color={onDeep ? "onDeep" : "inkMuted"}>{formatTime(range.end)}</Txt>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: "row", alignItems: "center", height: "100%", gap: 1.5 },
  bar: { flex: 1, borderRadius: 2 },
  playhead: { position: "absolute", top: -2, bottom: -2, width: 2, borderRadius: 1 },
  part: { position: "absolute", top: 0, bottom: 0, borderTopWidth: 2, borderBottomWidth: 2 },
  handle: { position: "absolute", top: -6, bottom: -6, width: HANDLE, alignItems: "center", justifyContent: "center" },
  grip: { width: 14, height: "100%", borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  gripLine: { width: 2, height: 20, borderRadius: 1, opacity: 0.85 },
  times: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, minHeight: 18 },
});
