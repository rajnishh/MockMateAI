import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";

import { addSection, blocksOf, moveSection, removeSection, SECTION_KINDS, type SectionKind, setSinger, type Singer } from "@/lib/song-structure";
import { fonts, radius, useTheme } from "@/theme";
import { Button, Txt } from "./ui";

// Song Studio Create's own controls: the mode switch, the structure blocks and the two dials.

export function ModeSwitch<T extends string>({ options, value, onChange }: { options: { value: T; label: string; help: string }[]; value: T; onChange: (v: T) => void }) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={[styles.modes, { backgroundColor: colors.surfaceSunken }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityHint={o.help}
            onPress={() => onChange(o.value)}
            style={[styles.mode, on && { backgroundColor: colors.pop }]}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: on ? colors.onPop : colors.inkMuted }}>{o.label}</Text>
            <Text style={{ fontFamily: fonts.medium, fontSize: 11.5, color: on ? colors.onBrandMuted : colors.inkMuted }}>{o.help}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// The same colours as the web blocks; plum text reads on all of them.
export const BLOCK_COLORS: Record<SectionKind, string> = {
  Intro: "#c2a9b8",
  Verse: "#ffb21a",
  "Pre-Chorus": "#ffd27a",
  Chorus: "#ff7a1a",
  Rap: "#14d9a0",
  Drop: "#ff4d2e",
  Bridge: "#ffa37a",
  Outro: "#c2a9b8",
};
const SINGER_MARK: Record<Singer, string> = { male: "♂", female: "♀", both: "♀♂" };
const SINGER_LABEL: Record<Singer, string> = { male: "Male", female: "Female", both: "Both" };
const NEXT_SINGER: Record<string, Singer | null> = { none: "male", male: "female", female: "both", both: null };

// The lyrics' [tags] as coloured blocks: tap + to add, tap a block to move it, pick its singer or remove it.
export function StructureBlocks({ lyrics, onChange, duet, dimEmpty }: { lyrics: string; onChange: (lyrics: string) => void; duet: boolean; dimEmpty: boolean }) {
  const { colors } = useTheme();
  const [picked, setPicked] = useState<number | null>(null);
  const blocks = blocksOf(lyrics);
  const sel = picked !== null && picked < blocks.length ? picked : null;

  function move(by: -1 | 1) {
    if (sel === null) return;
    onChange(moveSection(lyrics, sel, by));
    setPicked(sel + by);
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={[styles.blocks, { backgroundColor: colors.surfaceSunken }]}>
        {blocks.length === 0 ? <Txt variant="cap">Tap a block below to start your song&apos;s shape</Txt> : null}
        {blocks.map((b, i) => (
          <Pressable
            key={`${i}-${b.kind}`}
            accessibilityRole="button"
            accessibilityLabel={`${b.kind}${b.singer ? `, ${SINGER_LABEL[b.singer]}` : ""}${b.empty && dimEmpty ? ", no words yet" : ""}`}
            accessibilityState={{ selected: sel === i }}
            onPress={() => setPicked(sel === i ? null : i)}
            style={[
              styles.block,
              { backgroundColor: BLOCK_COLORS[b.kind], opacity: b.empty && dimEmpty ? 0.7 : 1 },
              sel === i && { borderColor: colors.ink },
            ]}>
            <Text style={styles.blockText}>{b.kind}</Text>
            {b.singer ? <Text style={styles.who}>{SINGER_MARK[b.singer]}</Text> : null}
          </Pressable>
        ))}
      </View>
      {sel !== null ? (
        <View style={styles.tools}>
          <Button label="←" small kind="secondary" disabled={sel === 0} onPress={() => move(-1)} />
          <Button label="→" small kind="secondary" disabled={sel === blocks.length - 1} onPress={() => move(1)} />
          {duet ? (
            <Button
              label={blocks[sel].singer ? `${SINGER_MARK[blocks[sel].singer!]} ${SINGER_LABEL[blocks[sel].singer!]}` : "Who sings: either"}
              small
              kind="secondary"
              onPress={() => onChange(setSinger(lyrics, sel, NEXT_SINGER[blocks[sel].singer ?? "none"]))}
            />
          ) : null}
          <Button
            label={`Remove ${blocks[sel].kind}`}
            small
            kind="danger"
            onPress={() => {
              onChange(removeSection(lyrics, sel));
              setPicked(null);
            }}
          />
        </View>
      ) : null}
      <View style={styles.palette}>
        {SECTION_KINDS.map((k) => (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityLabel={`Add ${k}`}
            onPress={() => onChange(addSection(lyrics, k))}
            style={({ pressed }) => [styles.add, { borderColor: colors.lineStrong, backgroundColor: colors.surfaceRaised, transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
            <View style={[styles.dot, { backgroundColor: BLOCK_COLORS[k] }]} />
            <Text style={{ fontFamily: fonts.bold, fontSize: 13.5, color: colors.ink }}>{k}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const STEP = 5;
const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v / STEP) * STEP));

interface Drag {
  width: number;
  start: number;
  value: number;
  onChange: (v: number) => void;
}

function dialResponder(ref: RefObject<Drag>) {
  return PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // Holds the drag so the screen doesn't scroll away mid-slide.
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      const d = ref.current;
      d.start = clamp((e.nativeEvent.locationX / d.width) * 100);
      d.onChange(d.start);
    },
    onPanResponderMove: (_, g) => {
      const d = ref.current;
      const v = clamp(d.start + (g.dx / d.width) * 100);
      if (v !== d.value) d.onChange(v);
    },
  });
}

// A 0-100 slider with a saffron fill. VoiceOver adjusts it by swiping up and down.
export function Dial({ label, left, right, value, onChange }: { label: string; left: string; right: string; value: number; onChange: (v: number) => void }) {
  const { colors } = useTheme();
  // What the drag handlers read: the track width, where a drag started, and the latest props.
  const drag = useRef<Drag>({ width: 1, start: value, value, onChange });
  useEffect(() => {
    drag.current.value = value;
    drag.current.onChange = onChange;
  }, [value, onChange]);
  // The responder only reads the ref inside its handlers, never during render.
  // eslint-disable-next-line react-hooks/refs
  const pan = useMemo(() => dialResponder(drag), []);
  const words = value <= 33 ? left : value >= 67 ? right : "Middle";

  return (
    <View style={{ gap: 6 }}>
      <Txt variant="label">{label}</Txt>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: value, text: `${words}, ${value} of 100` }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => onChange(clamp(value + (e.nativeEvent.actionName === "increment" ? 10 : -10)))}
        onLayout={(e) => (drag.current.width = Math.max(1, e.nativeEvent.layout.width))}
        style={styles.dialHit}
        {...pan.panHandlers}>
        <View pointerEvents="none" style={[styles.track, { backgroundColor: colors.line }]}>
          <View style={[styles.fill, { width: `${value}%`, backgroundColor: colors.brand }]} />
        </View>
        <View pointerEvents="none" style={[styles.thumb, { left: `${value}%`, backgroundColor: colors.surfaceRaised, borderColor: colors.brand }]} />
      </View>
      <View style={styles.ends}>
        <Txt variant="cap">{left}</Txt>
        <Txt variant="cap">{right}</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modes: { flexDirection: "row", padding: 4, borderRadius: radius.pill, gap: 4 },
  mode: { flex: 1, minHeight: 52, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  blocks: { flexDirection: "row", flexWrap: "wrap", gap: 6, padding: 8, borderRadius: 16, minHeight: 60, alignItems: "center" },
  block: { minHeight: 44, paddingHorizontal: 14, borderRadius: 10, borderWidth: 2, borderColor: "transparent", flexDirection: "row", alignItems: "center", gap: 6 },
  blockText: { fontFamily: fonts.extrabold, fontSize: 15, color: "#2a1235" },
  who: { fontFamily: fonts.bold, fontSize: 12, color: "#2a1235", backgroundColor: "rgba(255,255,255,0.55)", borderRadius: 6, paddingHorizontal: 5, overflow: "hidden" },
  tools: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  palette: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  add: { minHeight: 44, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1.5, borderStyle: "dashed", flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 3 },
  dialHit: { height: 44, justifyContent: "center" },
  track: { height: 10, borderRadius: radius.pill, overflow: "hidden" },
  fill: { height: 10 },
  thumb: { position: "absolute", width: 28, height: 28, marginLeft: -14, borderRadius: 14, borderWidth: 3, top: 8 },
  ends: { flexDirection: "row", justifyContent: "space-between" },
});
