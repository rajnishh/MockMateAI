import { useEvent } from "expo";
import { useVideoPlayer, type VideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Txt } from "@/components/ui";
import type { EditDraft, EditPlan } from "@/lib/api";
import type { CaptionLine } from "@/lib/moments";
import { fonts, radius } from "@/theme";

type Box = [number, number, number, number] | null;
export type Faces = { rate: number; boxes: Box[] } | null;

// Seeking sets the player's time; kept outside the hook because players are changed, not replaced.
function setPlayerTime(player: VideoPlayer, t: number) {
  player.currentTime = t;
}

// Play, pause and seek the preview. Without a video (demo mode, or no preview file) a timer
// stands in, so the timeline and overlays still work.
export function usePreviewClock(uri: string | null, headers: Record<string, string> | null, duration: number) {
  const player = useVideoPlayer(uri && headers ? { uri, headers } : null, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.1;
  });
  const { currentTime } = useEvent(player, "timeUpdate", { currentTime: 0, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: 0 });
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: false, oldIsPlaying: false });
  const real = Boolean(uri && headers);
  const [fake, setFake] = useState({ time: 0, playing: false });

  useEffect(() => {
    if (real || !fake.playing) return;
    const timer = setInterval(
      () =>
        setFake((f) => {
          const time = f.time + 0.1;
          return time >= duration ? { time: duration, playing: false } : { ...f, time };
        }),
      100,
    );
    return () => clearInterval(timer);
  }, [real, fake.playing, duration]);

  const seek = useCallback(
    (t: number) => {
      if (!Number.isFinite(t)) return;
      const time = Math.max(0, Math.min(duration, t));
      if (real) setPlayerTime(player, time);
      else setFake((f) => ({ ...f, time }));
    },
    [real, player, duration],
  );
  const toggle = useCallback(() => {
    if (real) {
      if (player.playing) player.pause();
      else {
        if (player.currentTime >= duration - 0.05) setPlayerTime(player, 0);
        player.play();
      }
    } else setFake((f) => ({ time: f.time >= duration ? 0 : f.time, playing: !f.playing }));
  }, [real, player, duration]);

  return { player: real ? player : null, time: real ? currentTime : fake.time, playing: real ? isPlaying : fake.playing, seek, toggle };
}

const W = 216;
const H = (W * 16) / 9;
const S = W / 1080;

// The clip with a rough sketch of the edit on top. The real render cuts the person out, so words
// sit behind them; here everything is drawn on top.
export function EditPreview({
  player,
  time,
  plan,
  off,
  words,
  lines,
  faces,
  captions,
  accent,
}: {
  player: ReturnType<typeof useVideoPlayer> | null;
  time: number;
  plan: EditPlan;
  off: Set<string>;
  words: EditDraft["words"];
  lines: CaptionLine[];
  faces: Faces;
  captions: boolean;
  accent: string;
}) {
  const on = <T extends { start: number; end: number }>(list: T[], prefix: string) => list.map((x, i) => ({ x, key: `${prefix}${i}` })).filter(({ x, key }) => !off.has(key) && time >= x.start && time <= x.end).map(({ x }) => x);
  const effect = on(plan.effects, "e")[0];
  const card = on(plan.cards, "c")[0];
  const zoom = on(plan.zooms, "z").length > 0;
  const face = faces?.boxes[Math.min(faces.boxes.length - 1, Math.round(time * faces.rate))] ?? null;
  const fx = face ? (face[0] + face[2] / 2) * W : W / 2;
  const fy = face ? (face[1] + face[3] / 2) * H : H * 0.42;
  const line = captions ? lines.find((l) => time >= l.start && time <= l.end + 0.4) : undefined;
  const lineWords = line ? words.slice(line.from, line.to + 1) : [];
  const active = lineWords.findIndex((w) => time < w.end);
  // Three words around the one being said, like the real captions.
  const shown = lineWords.slice(Math.max(0, Math.min(active < 0 ? lineWords.length - 3 : active - 1, lineWords.length - 3)), undefined).slice(0, 3);

  return (
    <View style={styles.frame} accessibilityLabel="Preview of your video with its effects">
      <View style={[StyleSheet.absoluteFill, zoom ? { transform: [{ translateX: (W / 2 - fx) * 0.14 }, { translateY: (H / 2 - fy) * 0.14 }, { scale: 1.14 }] } : null]}>
        {player ? <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} /> : <View style={[StyleSheet.absoluteFill, styles.stand]} />}
      </View>
      {!player ? (
        <View style={[styles.person, { left: fx - W * 0.22, top: fy - H * 0.08 }]} pointerEvents="none">
          <Txt style={{ color: "#c9d2e6", fontSize: 11, textAlign: "center" }}>You</Txt>
        </View>
      ) : null}
      {effect?.type === "spotlight" ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.55)" }]} /> : null}
      {effect?.type === "cutout" ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderWidth: 10, borderColor: accent }]} /> : null}
      {effect?.type === "backdrop" ? (
        <View pointerEvents="none" style={[styles.backdropBox, { top: Math.max(4, fy - H * 0.12) }]}>
          <Txt numberOfLines={2} style={styles.backdrop}>
            {effect.text.toUpperCase()}
          </Txt>
        </View>
      ) : null}
      {effect?.type === "stamp" ? (
        <View pointerEvents="none" style={[styles.stamp, { top: fy - 16, left: fx < W / 2 ? Math.min(W - 96, fx + 26) : Math.max(4, fx - 118) }]}>
          <Txt style={styles.stampText}>{effect.text.toUpperCase()}</Txt>
        </View>
      ) : null}
      {effect?.type === "focus" ? (
        <View pointerEvents="none" style={[styles.focus, { left: fx - (face ? face[2] * W * 0.7 : 34), top: fy - (face ? face[3] * H * 0.7 : 34), width: face ? face[2] * W * 1.4 : 68, height: face ? face[3] * H * 1.4 : 68 }]}>
          {effect.label ? <Txt style={styles.focusLabel}>{effect.label}</Txt> : null}
        </View>
      ) : null}
      {card ? (
        <View pointerEvents="none" style={[styles.card, { top: H * 0.6 - 26, backgroundColor: card.type === "stat" ? accent : "rgba(255,255,255,0.92)" }]}>
          <Txt numberOfLines={3} style={{ fontFamily: fonts.bold, fontSize: 12, textAlign: "center", color: card.type === "stat" ? "#fff" : "#111" }}>
            {card.type === "list" ? `${card.heading}\n${card.items.filter(Boolean).map((x) => `✓ ${x}`).join("\n")}` : card.type === "stat" ? `${card.prefix ?? ""}${card.value}${card.suffix ?? ""} ${card.label}` : card.type === "cta" ? `${card.text}${card.action ? ` · ${card.action}` : ""}` : card.text}
          </Txt>
        </View>
      ) : null}
      {shown.length ? (
        <View pointerEvents="none" style={styles.caption}>
          <Txt style={{ color: "#fff", fontFamily: fonts.bold, fontSize: 13, textAlign: "center" }}>
            {shown.map((w, i) => (
              <Txt key={i} style={{ color: lineWords.indexOf(w) === active ? "#ffd166" : "#fff", fontFamily: fonts.bold, fontSize: 13 }}>
                {i ? " " : ""}
                {w.word}
              </Txt>
            ))}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: W, height: H, alignSelf: "center", borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#0b1220" },
  stand: { backgroundColor: "#1d2a47" },
  person: { position: "absolute", width: W * 0.44, height: H * 0.6, borderTopLeftRadius: 80, borderTopRightRadius: 80, backgroundColor: "#33456e", paddingTop: 30 },
  backdropBox: { position: "absolute", left: 6, right: 6 },
  backdrop: { color: "rgba(255,255,255,0.9)", fontFamily: fonts.bold, fontSize: 200 * S * 2.2, lineHeight: 200 * S * 2.4, textAlign: "center" },
  stamp: { position: "absolute", borderWidth: 3, borderColor: "#e23b3b", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, transform: [{ rotate: "-8deg" }] },
  stampText: { color: "#e23b3b", fontFamily: fonts.bold, fontSize: 18 },
  focus: { position: "absolute", borderWidth: 2, borderColor: "#ffffff", borderRadius: 6, justifyContent: "flex-end", alignItems: "center" },
  focusLabel: { color: "#111", backgroundColor: "#fff", fontSize: 10, paddingHorizontal: 6, borderRadius: 8, marginBottom: -18 },
  card: { position: "absolute", left: W * 0.07, right: W * 0.07, borderRadius: 10, padding: 8 },
  caption: { position: "absolute", left: 8, right: 8, top: H * 0.8 - 14, backgroundColor: "rgba(10,10,14,0.72)", borderRadius: 10, paddingVertical: 4 },
});
