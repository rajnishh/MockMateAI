import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/icon";
import { SongCover } from "@/components/song-cover";
import { type Track, useSongPlayer } from "@/components/song-player";
import { Button, ChipRow, Txt } from "@/components/ui";
import { genreLabel } from "@/lib/songs";
import { radius, useTheme } from "@/theme";

// Up next: what's playing, what you queued, and Autoplay's picks after it. Remove has Undo.
export default function QueueSheet() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const player = useSongPlayer();
  const [removed, setRemoved] = useState<Track | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(undoTimer.current), []);
  const now = player.song;
  const next = player.upNext;
  const mine = next.filter((t) => !t.auto);
  const auto = next.filter((t) => t.auto);
  const indexOf = (t: Track) => player.queue.items.findIndex((x) => x.key === t.key);

  function remove(t: Track) {
    player.remove(t.key);
    setRemoved(t);
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setRemoved(null), 4000);
  }

  const row = (t: Track, playing = false) => (
    <View key={t.key} style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? `Now playing ${t.title}` : `Play ${t.title} now`}
        disabled={playing}
        onPress={() => player.skipTo(indexOf(t))}
        style={({ pressed }) => [styles.rowMain, { opacity: pressed ? 0.7 : 1 }]}>
        <SongCover song={t} size={48} radius={radius.md} />
        <View style={{ flex: 1 }}>
          <Txt variant="label" numberOfLines={1} color={playing ? "tealText" : "ink"}>
            {t.title}
          </Txt>
          <Txt variant="cap" numberOfLines={1}>
            {t.handle ? `@${t.handle} · ${genreLabel(t.genre)}` : `Your song · ${genreLabel(t.genre)}`}
          </Txt>
        </View>
      </Pressable>
      {playing ? null : (
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${t.title}`} onPress={() => remove(t)} hitSlop={8} style={styles.remove}>
          <Icon name="close" size={20} color={colors.inkMuted} />
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 24 }}>
        <View style={[styles.head, { borderBottomColor: colors.line }]}>
          <Txt variant="lg" accessibilityRole="header" style={{ flex: 1 }}>
            Up next
          </Txt>
          <Button label="Done" kind="ghost" small onPress={() => router.back()} />
        </View>
        <Txt variant="over">NOW PLAYING</Txt>
        {now ? row(now as Track, true) : <Txt variant="cap">Nothing is playing.</Txt>}

        <View style={styles.sectionHead}>
          <Txt variant="over" style={{ flex: 1 }}>
            NEXT UP
          </Txt>
          {next.length ? <Button label="Clear" kind="ghost" small onPress={player.clear} /> : null}
        </View>
        {mine.length ? mine.map((t) => row(t)) : <Txt variant="cap">Nothing queued. Long-press a song on Listen to add it.</Txt>}

        <Txt variant="over">REPEAT</Txt>
        <ChipRow
          options={[
            { value: "off", label: "Off" },
            { value: "all", label: "All" },
            { value: "one", label: "This song" },
          ]}
          value={player.repeat}
          onChange={player.setRepeat}
        />
        <View style={[styles.switch, { backgroundColor: colors.surfaceSunken }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="label">Keep the music going</Txt>
            <Txt variant="cap">{player.repeat === "off" ? "When your queue ends, we'll play songs like these: same style, language or mood." : "Off while Repeat is on."}</Txt>
          </View>
          <Switch accessibilityLabel="Keep the music going" value={player.autoplay} onValueChange={player.setAutoplay} trackColor={{ true: colors.teal, false: colors.lineStrong }} />
        </View>
        {player.autoplay && auto.length ? (
          <>
            <Txt variant="over">AUTOPLAY</Txt>
            {auto.map((t) => row(t))}
          </>
        ) : null}
      </ScrollView>
      {removed ? (
        <View style={[styles.toast, { backgroundColor: colors.deep, bottom: insets.bottom + 16 }]} accessibilityLiveRegion="polite">
          <Txt variant="label" numberOfLines={1} style={{ color: colors.onDeep, flex: 1 }}>
            {`Removed ${removed.title}`}
          </Txt>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              player.addToQueue(removed);
              setRemoved(null);
            }}
            hitSlop={8}>
            <Txt variant="label" style={{ color: colors.teal }}>
              Undo
            </Txt>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", paddingTop: 8, paddingBottom: 10, marginBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  sectionHead: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 },
  remove: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  switch: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.lg, padding: 14, marginTop: 8 },
  toast: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 12 },
});
