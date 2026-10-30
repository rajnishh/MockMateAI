import { type ComponentRef, useEffect, useRef, useState } from "react";
import { type GestureResponderEvent, PanResponder, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { Txt } from "@/components/ui";
import type { Span } from "@/lib/api";
import { type CaptionLine, type DragMode, dragSpan, formatTime, type MomentKind } from "@/lib/moments";
import { fonts, useTheme } from "@/theme";

export interface TimelineMoment {
  key: string;
  kind: MomentKind;
  label: string;
  start: number;
  end: number;
  off: boolean;
  problem?: string;
}

const PX_PER_SEC = 56;
const LANE_H = 40;
const RULER_H = 22;
// Touches this close to a block's edge pull the edge instead of moving the block.
const EDGE = 14;
const LANES: { kind: MomentKind | "captions"; label: string }[] = [
  { kind: "effect", label: "Effects" },
  { kind: "card", label: "Cards" },
  { kind: "zoom", label: "Zooms" },
  { kind: "captions", label: "Captions" },
];

// A scrollable strip with one lane per kind of moment: drag a block to move it, drag its edges
// to make it longer or shorter, tap the ruler to move the playhead.
export function EditTimeline({
  duration,
  moments,
  lines,
  snaps,
  time,
  playing,
  selected,
  onSelect,
  onSeek,
  onChange,
}: {
  duration: number;
  moments: TimelineMoment[];
  lines: CaptionLine[];
  snaps: number[];
  time: number;
  playing: boolean;
  selected: string | null;
  onSelect: (key: string) => void;
  onSeek: (t: number) => void;
  onChange: (key: string, span: Span, mode: DragMode) => void;
}) {
  const { colors } = useTheme();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [dragging, setDragging] = useState(false);
  const [view, setView] = useState({ x: 0, w: 0 });
  const width = Math.max(1, duration) * PX_PER_SEC;

  // While playing, keep the playhead in view.
  useEffect(() => {
    if (!playing || !view.w) return;
    const x = time * PX_PER_SEC;
    if (x < view.x || x > view.x + view.w - 40) scroll.current?.scrollTo({ x: Math.max(0, x - 40), animated: false });
  }, [time, playing, view]);

  // Native gives locationX; on the web a mouse click carries offsetX instead.
  const seekAt = (e: GestureResponderEvent) => {
    const n = e.nativeEvent as unknown as { locationX?: number; offsetX?: number };
    const x = Number.isFinite(n.locationX) ? n.locationX! : (n.offsetX ?? NaN);
    if (Number.isFinite(x)) onSeek(Math.max(0, Math.min(duration, x / PX_PER_SEC)));
  };

  return (
    <View style={{ flexDirection: "row" }}>
      <View style={{ paddingTop: RULER_H, width: 64 }}>
        {LANES.map((l) => (
          <View key={l.kind} style={{ height: LANE_H, justifyContent: "center" }}>
            <Txt variant="cap">{l.label}</Txt>
          </View>
        ))}
      </View>
      <ScrollView
        ref={scroll}
        horizontal
        scrollEnabled={!dragging}
        showsHorizontalScrollIndicator
        onLayout={(e) => setView((v) => ({ ...v, w: e.nativeEvent.layout.width }))}
        onScroll={(e) => setView((v) => ({ ...v, x: e.nativeEvent.contentOffset.x }))}
        scrollEventThrottle={32}
        style={{ flex: 1 }}>
        <View style={{ width, height: RULER_H + LANE_H * LANES.length }}>
          <Pressable accessibilityRole="adjustable" accessibilityLabel="Timeline ruler: tap to move the playhead" onPress={seekAt} style={{ height: RULER_H, width }}>
            {Array.from({ length: Math.floor(duration) + 1 }, (_, s) => (
              <View key={s} pointerEvents="none" style={[styles.tick, { left: s * PX_PER_SEC, borderColor: colors.line }]}>
                {s % 2 === 0 ? (
                  <Txt variant="cap" style={{ fontSize: 10, lineHeight: 12 }}>
                    {s}s
                  </Txt>
                ) : null}
              </View>
            ))}
          </Pressable>
          {LANES.map((l, i) => (
            <Pressable
              key={l.kind}
              accessibilityLabel={`${l.label} lane`}
              onPress={seekAt}
              style={[styles.lane, { top: RULER_H + i * LANE_H, width, backgroundColor: i % 2 ? colors.surface : colors.surfaceSunken }]}
            />
          ))}
          {lines.map((l) => (
            <View
              key={l.from}
              pointerEvents="none"
              style={[
                styles.block,
                { top: RULER_H + 3 * LANE_H + 6, left: l.start * PX_PER_SEC, width: Math.max(6, (l.end - l.start) * PX_PER_SEC - 2), backgroundColor: colors.surfaceRaised, borderColor: colors.line },
              ]}>
              <Txt variant="cap" numberOfLines={1} style={{ fontSize: 11 }}>
                {l.text}
              </Txt>
            </View>
          ))}
          {moments.map((m) => (
            <Block
              key={m.key}
              moment={m}
              top={RULER_H + LANES.findIndex((l) => l.kind === m.kind) * LANE_H + 4}
              selected={selected === m.key}
              duration={duration}
              snaps={snaps}
              onSelect={onSelect}
              onChange={onChange}
              onDragging={setDragging}
            />
          ))}
          <View pointerEvents="none" style={[styles.playhead, { left: time * PX_PER_SEC, backgroundColor: colors.coral }]} />
        </View>
      </ScrollView>
    </View>
  );
}

function Block({
  moment,
  top,
  selected,
  duration,
  snaps,
  onSelect,
  onChange,
  onDragging,
}: {
  moment: TimelineMoment;
  top: number;
  selected: boolean;
  duration: number;
  snaps: number[];
  onSelect: (key: string) => void;
  onChange: (key: string, span: Span, mode: DragMode) => void;
  onDragging: (v: boolean) => void;
}) {
  const { colors } = useTheme();
  const width = Math.max(10, (moment.end - moment.start) * PX_PER_SEC);
  // The responder is made once; it reads the latest props through this ref.
  const latest = useRef({ moment, width, duration, snaps, onSelect, onChange, onDragging });
  useEffect(() => {
    latest.current = { moment, width, duration, snaps, onSelect, onChange, onDragging };
  });
  const drag = useRef<{ mode: DragMode; origin: Span } | null>(null);
  // The handlers read the refs only inside touch callbacks, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const p = latest.current;
        const x = e.nativeEvent.locationX;
        // Narrow blocks only move; their length changes with the buttons below the timeline.
        const edges = p.width >= EDGE * 3.5;
        const mode: DragMode = edges && x < EDGE ? "start" : edges && x > p.width - EDGE ? "end" : "move";
        drag.current = { mode, origin: { start: p.moment.start, end: p.moment.end } };
        p.onSelect(p.moment.key);
        p.onDragging(true);
      },
      onPanResponderMove: (_e, g) => {
        const p = latest.current;
        if (!drag.current || p.moment.off) return;
        const span = dragSpan(drag.current.origin, drag.current.mode, g.dx / PX_PER_SEC, p.moment.kind, p.duration, p.snaps);
        p.onChange(p.moment.key, span, drag.current.mode);
      },
      onPanResponderRelease: () => {
        drag.current = null;
        latest.current.onDragging(false);
      },
      onPanResponderTerminate: () => {
        drag.current = null;
        latest.current.onDragging(false);
      },
    }),
  );

  const fill = moment.kind === "effect" ? colors.teal : moment.kind === "card" ? colors.coral : colors.action;
  const ink = moment.kind === "effect" ? colors.onTeal : moment.kind === "card" ? colors.onCoral : colors.onAction;
  return (
    <View
      {...responder.panHandlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${moment.label}, ${formatTime(moment.start)} to ${formatTime(moment.end)}${moment.off ? ", off" : ""}${moment.problem ? `. ${moment.problem}` : ""}`}
      accessibilityHint="Drag to move. Drag an edge to make it longer or shorter."
      style={[
        styles.block,
        {
          top,
          left: moment.start * PX_PER_SEC,
          width,
          height: LANE_H - 8,
          backgroundColor: moment.off ? "transparent" : fill,
          borderColor: moment.problem ? colors.danger : selected ? colors.focusRing : moment.off ? colors.lineStrong : fill,
          borderWidth: moment.problem || selected ? 3 : 1,
          borderStyle: moment.off ? "dashed" : "solid",
          opacity: moment.off ? 0.7 : 1,
          // Web: show the grab cursor.
          ...({ cursor: "grab" } as object),
        },
      ]}>
      {width >= EDGE * 3.5 && !moment.off ? <View pointerEvents="none" style={[styles.handle, { left: 3, backgroundColor: ink }]} /> : null}
      <Txt numberOfLines={1} style={{ color: moment.off ? colors.inkMuted : ink, fontFamily: fonts.bold, fontSize: 11, marginHorizontal: 8 }}>
        {moment.label}
      </Txt>
      {width >= EDGE * 3.5 && !moment.off ? <View pointerEvents="none" style={[styles.handle, { right: 3, backgroundColor: ink }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tick: { position: "absolute", top: 0, height: RULER_H, borderLeftWidth: 1, paddingLeft: 2 },
  lane: { position: "absolute", left: 0, height: LANE_H },
  block: { position: "absolute", height: LANE_H - 12, borderRadius: 8, borderWidth: 1, justifyContent: "center", overflow: "hidden" },
  handle: { position: "absolute", top: 8, bottom: 8, width: 3, borderRadius: 2, opacity: 0.6 },
  playhead: { position: "absolute", top: 0, bottom: 0, width: 2 },
});
