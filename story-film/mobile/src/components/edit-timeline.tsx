import { type ComponentRef, useEffect, useRef, useState } from "react";
import { type GestureResponderEvent, PanResponder, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { Button, Row, Txt } from "@/components/ui";
import type { Span } from "@/lib/api";
import { type CaptionLine, clampZoom, type DragMode, fitZoom, formatTime, type MomentKind, scrollForZoom, type Word, WORD_ZOOM } from "@/lib/moments";
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

const LANE_H = 40;
const RULER_H = 22;
const EDGE = 14;
const LANES: { kind: MomentKind | "captions"; label: string }[] = [
  { kind: "effect", label: "Effects" },
  { kind: "card", label: "Cards" },
  { kind: "zoom", label: "Zooms" },
  { kind: "captions", label: "Captions" },
];

const distance = (e: GestureResponderEvent) => {
  const [a, b] = e.nativeEvent.touches;
  return a && b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : 0;
};

// A scrollable strip with one lane per kind of moment: drag a block to move it, drag its edges
// to make it longer or shorter, tap the ruler to move the playhead. Pinch (or −/+) to zoom; zoomed
// in far enough, the captions lane shows single words that can be retimed the same way.
export function EditTimeline({
  duration,
  moments,
  lines,
  words,
  snaps,
  time,
  playing,
  selected,
  onSelect,
  onSeek,
  onChange,
  onWordDrag,
}: {
  duration: number;
  moments: TimelineMoment[];
  lines: CaptionLine[];
  words: Word[];
  snaps: number[];
  time: number;
  playing: boolean;
  selected: string | null;
  onSelect: (key: string) => void;
  onSeek: (t: number) => void;
  onChange: (key: string, origin: Span, mode: DragMode, deltaSec: number) => void;
  onWordDrag: (index: number, origin: Span, mode: DragMode, deltaSec: number) => void;
}) {
  const { colors } = useTheme();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const frame = useRef<ComponentRef<typeof View>>(null);
  const [dragging, setDragging] = useState(false);
  const [view, setView] = useState({ x: 0, w: 0, left: 0 });
  const [pps, setPps] = useState(56);
  // Where to scroll once a zoom has been laid out.
  const pendingScroll = useRef<number | null>(null);
  const width = Math.max(1, duration) * pps;
  const showWords = pps >= WORD_ZOOM && words.length > 0;

  useEffect(() => {
    if (pendingScroll.current === null) return;
    scroll.current?.scrollTo({ x: pendingScroll.current, animated: false });
    pendingScroll.current = null;
  }, [pps]);

  // While playing, keep the playhead in view.
  useEffect(() => {
    if (!playing || !view.w) return;
    const x = time * pps;
    if (x < view.x || x > view.x + view.w - 40) scroll.current?.scrollTo({ x: Math.max(0, x - 40), animated: false });
  }, [time, playing, view, pps]);

  const zoomTo = (next: number, focusX = view.w / 2) => {
    const to = clampZoom(next, view.w || 300, duration);
    if (Math.abs(to - pps) < 0.01) return;
    pendingScroll.current = scrollForZoom(view.x, focusX, pps, to);
    setPps(to);
  };

  // Two fingers anywhere on the timeline zoom it around the point between them.
  const latest = useRef({ pps, zoomTo, view });
  useEffect(() => {
    latest.current = { pps, zoomTo, view };
  });
  const pinch = useRef<{ d0: number; pps0: number; focus: number } | null>(null);
  // The handlers read the refs only inside touch callbacks, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [pinchResponder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponderCapture: (e) => e.nativeEvent.touches.length === 2,
      onMoveShouldSetPanResponderCapture: (e) => e.nativeEvent.touches.length === 2,
      onPanResponderGrant: (e) => {
        const [a, b] = e.nativeEvent.touches;
        const mid = a && b ? (a.pageX + b.pageX) / 2 : 0;
        pinch.current = { d0: distance(e) || 1, pps0: latest.current.pps, focus: mid - latest.current.view.left };
      },
      onPanResponderMove: (e) => {
        const p = pinch.current;
        const d = distance(e);
        if (p && d) latest.current.zoomTo((p.pps0 * d) / p.d0, p.focus);
      },
      onPanResponderRelease: () => (pinch.current = null),
      onPanResponderTerminate: () => (pinch.current = null),
    }),
  );

  // Native gives locationX; on the web a mouse click carries offsetX instead.
  const seekAt = (e: GestureResponderEvent) => {
    const n = e.nativeEvent as unknown as { locationX?: number; offsetX?: number };
    const x = Number.isFinite(n.locationX) ? n.locationX! : (n.offsetX ?? NaN);
    if (Number.isFinite(x)) onSeek(Math.max(0, Math.min(duration, x / pps)));
  };
  // Tapping a caption line zooms in on it so its words can be retimed.
  const openLine = (l: CaptionLine) => {
    const to = Math.max(WORD_ZOOM * 1.4, pps);
    pendingScroll.current = Math.max(0, l.start * to - 24);
    setPps(clampZoom(to, view.w || 300, duration));
    onSeek(l.start);
  };

  const tick = pps >= 120 ? 0.5 : pps >= 30 ? 1 : pps >= 12 ? 5 : 10;
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ alignItems: "center", gap: 8 }}>
        <Button label="−" small kind="secondary" onPress={() => zoomTo(pps / 1.5)} />
        <Button label="Fit" small kind="secondary" onPress={() => zoomTo(fitZoom(view.w || 300, duration), 0)} />
        <Button label="+" small kind="secondary" onPress={() => zoomTo(pps * 1.5)} />
        <Txt variant="cap" style={{ flex: 1 }}>
          {showWords ? "Drag a word to retime it" : "Pinch or + to zoom; zoom in to retime words"}
        </Txt>
      </Row>
      <View
        ref={frame}
        {...pinchResponder.panHandlers}
        onLayout={() => frame.current?.measureInWindow((left) => setView((v) => ({ ...v, left: left + 64 })))}
        // minWidth 0 / overflow hidden: the wide strip scrolls inside instead of widening the screen.
        style={{ flexDirection: "row", width: "100%", minWidth: 0, overflow: "hidden" }}>
        <View style={{ paddingTop: RULER_H, width: 64 }}>
          {LANES.map((l) => (
            <View key={l.kind} style={{ height: LANE_H, justifyContent: "center" }}>
              <Txt variant="cap">{l.kind === "captions" && showWords ? "Words" : l.label}</Txt>
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
          style={{ flex: 1, minWidth: 0 }}>
          <View style={{ width, height: RULER_H + LANE_H * LANES.length }}>
            <Pressable accessibilityRole="adjustable" accessibilityLabel="Timeline ruler: tap to move the playhead" onPress={seekAt} style={{ height: RULER_H, width }}>
              {Array.from({ length: Math.floor(duration / tick) + 1 }, (_, i) => (
                <View key={i} pointerEvents="none" style={[styles.tick, { left: i * tick * pps, borderColor: colors.line }]}>
                  {i % 2 === 0 ? (
                    <Txt variant="cap" style={{ fontSize: 10, lineHeight: 12 }}>
                      {tick < 1 ? (i * tick).toFixed(1) : i * tick}s
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
            {showWords
              ? words.map((w, i) => (
                  <Block
                    key={`w${i}`}
                    id={`w${i}`}
                    label={w.word}
                    a11y={`Caption word ${w.word}`}
                    start={w.start}
                    end={w.end}
                    top={RULER_H + 3 * LANE_H + 4}
                    pps={pps}
                    fill={colors.surfaceRaised}
                    ink={colors.ink}
                    border={colors.lineStrong}
                    selected={selected === `w${i}`}
                    onSelect={onSelect}
                    onDrag={(origin, mode, delta) => onWordDrag(i, origin, mode, delta)}
                    onDragging={setDragging}
                  />
                ))
              : lines.map((l) => (
                  <Pressable
                    key={l.from}
                    accessibilityRole="button"
                    accessibilityLabel={`Caption line at ${formatTime(l.start)}: ${l.text}. Tap to zoom in and retime its words.`}
                    onPress={() => openLine(l)}
                    style={[
                      styles.block,
                      { top: RULER_H + 3 * LANE_H + 6, left: l.start * pps, width: Math.max(6, (l.end - l.start) * pps - 2), backgroundColor: colors.surfaceRaised, borderColor: colors.line },
                    ]}>
                    <Txt variant="cap" numberOfLines={1} style={{ fontSize: 11, marginHorizontal: 4 }}>
                      {l.text}
                    </Txt>
                  </Pressable>
                ))}
            {moments.map((m) => {
              const fill = m.kind === "effect" ? colors.teal : m.kind === "card" ? colors.coral : colors.action;
              return (
                <Block
                  key={m.key}
                  id={m.key}
                  label={m.label}
                  a11y={`${m.label}, ${formatTime(m.start)} to ${formatTime(m.end)}${m.off ? ", off" : ""}${m.problem ? `. ${m.problem}` : ""}`}
                  start={m.start}
                  end={m.end}
                  top={RULER_H + LANES.findIndex((l) => l.kind === m.kind) * LANE_H + 4}
                  pps={pps}
                  fill={m.off ? "transparent" : fill}
                  ink={m.off ? colors.inkMuted : m.kind === "effect" ? colors.onTeal : m.kind === "card" ? colors.onCoral : colors.onAction}
                  border={m.problem ? colors.danger : m.off ? colors.lineStrong : fill}
                  dashed={m.off}
                  heavy={Boolean(m.problem)}
                  selected={selected === m.key}
                  locked={m.off}
                  onSelect={onSelect}
                  onDrag={(origin, mode, delta) => onChange(m.key, origin, mode, delta)}
                  onDragging={setDragging}
                />
              );
            })}
            <View pointerEvents="none" style={[styles.playhead, { left: time * pps, backgroundColor: colors.coral }]} />
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

// One draggable block: the middle moves it, the outer quarters (up to 14 px) pull an edge.
function Block({
  id,
  label,
  a11y,
  start,
  end,
  top,
  pps,
  fill,
  ink,
  border,
  dashed,
  heavy,
  selected,
  locked,
  onSelect,
  onDrag,
  onDragging,
}: {
  id: string;
  label: string;
  a11y: string;
  start: number;
  end: number;
  top: number;
  pps: number;
  fill: string;
  ink: string;
  border: string;
  dashed?: boolean;
  heavy?: boolean;
  selected: boolean;
  locked?: boolean;
  onSelect: (id: string) => void;
  onDrag: (origin: Span, mode: DragMode, deltaSec: number) => void;
  onDragging: (v: boolean) => void;
}) {
  const { colors } = useTheme();
  const width = Math.max(10, (end - start) * pps);
  const edge = Math.min(EDGE, width / 4);
  const edges = width >= 24;
  // The responder is made once; it reads the latest props through this ref.
  const latest = useRef({ id, start, end, width, edge, edges, pps, locked, onSelect, onDrag, onDragging });
  useEffect(() => {
    latest.current = { id, start, end, width, edge, edges, pps, locked, onSelect, onDrag, onDragging };
  });
  const drag = useRef<{ mode: DragMode; origin: Span } | null>(null);
  // The handlers read the refs only inside touch callbacks, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => e.nativeEvent.touches.length < 2,
      onMoveShouldSetPanResponder: (e) => e.nativeEvent.touches.length < 2,
      // A second finger means a pinch: let the timeline take over.
      onPanResponderTerminationRequest: (e) => e.nativeEvent.touches.length > 1,
      onPanResponderGrant: (e) => {
        const p = latest.current;
        const x = e.nativeEvent.locationX;
        const mode: DragMode = p.edges && x < p.edge ? "start" : p.edges && x > p.width - p.edge ? "end" : "move";
        drag.current = { mode, origin: { start: p.start, end: p.end } };
        p.onSelect(p.id);
        p.onDragging(true);
      },
      onPanResponderMove: (_e, g) => {
        const p = latest.current;
        if (!drag.current || p.locked) return;
        p.onDrag(drag.current.origin, drag.current.mode, g.dx / p.pps);
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

  return (
    <View
      {...responder.panHandlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityHint="Drag to move. Drag an edge to make it longer or shorter."
      style={[
        styles.block,
        {
          top,
          left: start * pps,
          width,
          height: LANE_H - 8,
          backgroundColor: fill,
          borderColor: selected && !heavy ? colors.focusRing : border,
          borderWidth: heavy || selected ? 3 : 1,
          borderStyle: dashed ? "dashed" : "solid",
          opacity: dashed ? 0.7 : 1,
          // Web: show the grab cursor.
          ...({ cursor: "grab" } as object),
        },
      ]}>
      {edges && !locked && width >= 40 ? <View pointerEvents="none" style={[styles.handle, { left: 3, backgroundColor: ink }]} /> : null}
      <Txt numberOfLines={1} style={{ color: ink, fontFamily: fonts.bold, fontSize: 11, marginHorizontal: width >= 40 ? 8 : 2 }}>
        {label}
      </Txt>
      {edges && !locked && width >= 40 ? <View pointerEvents="none" style={[styles.handle, { right: 3, backgroundColor: ink }]} /> : null}
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
