import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { api, type Song } from "@/lib/api";
import { listenSongs, sharedSongs } from "@/lib/loop-sources";
import { genreLabel } from "@/lib/songs";
import { useData } from "@/lib/use-data";
import { fonts, useTheme } from "@/theme";
import { Icon } from "./icon";
import { SongCover } from "./song-cover";
import { PauseGlyph, PlayGlyph, type Repeat, useSongPlayer } from "./song-player";
import { ChipRow, ListRow, Sheet, Txt } from "./ui";

// The song that's playing, above the tab bar. Tap to open the full player, long-press for Loop.
// With nothing loaded it shows nothing, except on Home (`loopPill`), where a "Loop my songs"
// pill plays your songs on repeat. Still the one player: the pill only starts it.
export function MiniPlayer({ loopPill = false }: { loopPill?: boolean }) {
  const { colors, mode } = useTheme();
  const player = useSongPlayer();
  const [sheet, setSheet] = useState(false);
  const song = player.song;
  if (!song) return loopPill ? <LoopPill /> : null;
  const { status, repeat } = player;
  const duration = status.duration > 0 ? status.duration : song.durationSec;
  const progress = duration ? Math.min(1, status.currentTime / duration) : 0;
  const muted = "rgba(255, 241, 230, 0.68)";
  const sub = repeat === "one" ? "Looping this song" : repeat === "all" ? `Looping · ${player.queue.items.length} ${player.queue.items.length === 1 ? "song" : "songs"}` : song.handle ? `@${song.handle} · ${genreLabel(song.genre)}` : genreLabel(song.genre);
  const canNext = player.upNext.length > 0 || (repeat === "all" && player.queue.items.length > 1);
  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Now playing ${song.title}${repeat === "off" ? "" : `, ${sub.toLowerCase()}`}. Opens the player`}
        accessibilityHint="Long-press for Loop"
        onPress={() => router.push(`/songs/play/${song.id}`)}
        onLongPress={() => setSheet(true)}
        style={({ pressed }) => [styles.bar, { backgroundColor: mode === "dark" ? colors.surfaceOverlay : colors.deep, opacity: pressed ? 0.92 : 1 }]}>
        <View>
          <SongCover song={song} size={42} radius={10} />
          {repeat !== "off" ? (
            <View style={[styles.badge, { backgroundColor: colors.teal }]}>
              <Icon name={repeat === "one" ? "repeat-one" : "repeat"} size={12} color={colors.onTeal} />
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Txt variant="label" numberOfLines={1} style={{ color: colors.onDeep }}>
            {song.title}
          </Txt>
          <Txt variant="cap" numberOfLines={1} style={{ color: muted, fontFamily: fonts.medium, fontSize: 12 }}>
            {sub}
          </Txt>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={status.playing ? `Pause ${song.title}` : `Play ${song.title}`}
          onPress={() => player.toggle(song)}
          hitSlop={8}
          style={[styles.play, { backgroundColor: colors.pop }]}>
          {!status.isLoaded ? <ActivityIndicator color={colors.onPop} /> : status.playing ? <PauseGlyph color={colors.onPop} size={16} /> : <PlayGlyph color={colors.onPop} size={20} />}
        </Pressable>
        {canNext ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Next song" onPress={player.upNext.length ? player.next : () => player.skipTo(0)} hitSlop={8} style={styles.close}>
            <Icon name="next" size={20} color={colors.onDeep} />
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Stop and close" onPress={player.stop} hitSlop={8} style={styles.close}>
            <Txt variant="md" style={{ color: muted, fontSize: 20, lineHeight: 22 }}>
              ×
            </Txt>
          </Pressable>
        )}
        <View style={[styles.track, { backgroundColor: "rgba(255, 241, 230, 0.14)" }]} pointerEvents="none">
          <View style={{ width: `${progress * 100}%`, height: "100%", backgroundColor: colors.teal, borderRadius: 2 }} />
        </View>
      </Pressable>
      {sheet ? <LoopSheet visible onClose={() => setSheet(false)} /> : null}
    </View>
  );
}

// Home's idle pill: tap loops all your ready songs, newest first; long-press for the Loop sheet.
function LoopPill() {
  const { colors, mode } = useTheme();
  const player = useSongPlayer();
  const studio = useData(() => api.songs());
  const [sheet, setSheet] = useState(false);
  const ready = (studio.data?.songs ?? []).filter((s) => s.audioUrl);
  if (!ready.length) return null;
  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, alignItems: "flex-end" }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Loop my songs, ${ready.length} ${ready.length === 1 ? "song" : "songs"}`}
        accessibilityHint="Plays your songs on repeat. Long-press for more"
        onPress={() => player.loop(ready)}
        onLongPress={() => setSheet(true)}
        style={({ pressed }) => [styles.pill, { backgroundColor: mode === "dark" ? colors.surfaceOverlay : colors.deep, opacity: pressed ? 0.9 : 1 }]}>
        <View style={[styles.pillDot, { backgroundColor: colors.teal }]}>
          <Icon name="repeat" size={18} color={colors.onTeal} />
        </View>
        <Txt variant="label" style={{ color: colors.onDeep }}>
          Loop my songs
        </Txt>
      </Pressable>
      {sheet ? <LoopSheet visible onClose={() => setSheet(false)} songs={ready} /> : null}
    </View>
  );
}

const REPEAT_OPTIONS: { value: Repeat; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "all", label: "All" },
  { value: "one", label: "One" },
];

function LoopSheet({ visible, onClose, songs }: { visible: boolean; onClose: () => void; songs?: Song[] }) {
  const player = useSongPlayer();
  const studio = useData(() => (songs ? Promise.resolve({ songs }) : api.songs()));
  const ready = (songs ?? studio.data?.songs ?? []).filter((s) => s.audioUrl);
  const shared = useData(sharedSongs);
  const listen = useData(listenSongs);
  const sharedList = shared.data ?? [];
  const listenList = listen.data ?? [];
  const everything = [...ready, ...sharedList, ...listenList];
  const count = (n: number) => `${n} ${n === 1 ? "song" : "songs"}`;
  const done = (f: () => void) => () => {
    f();
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Txt variant="md" accessibilityRole="header">
        Loop
      </Txt>
      {ready.length ? <ListRow icon="repeat" title="Loop all my songs" sub={`${count(ready.length)}, newest first`} onPress={done(() => player.loop(ready))} /> : null}
      {sharedList.length ? (
        <ListRow icon="gift" title="Loop songs shared with me" sub={`${count(sharedList.length)}: gift replies, Jugalbandis and remixes`} onPress={done(() => player.loop(sharedList))} />
      ) : shared.loading ? (
        <ListRow icon="gift" title="Loop songs shared with me" sub="Looking…" />
      ) : null}
      {listenList.length ? <ListRow icon="headphones" title="Loop Listen" sub={`${count(listenList.length)}: trending and new from other creators`} onPress={done(() => player.loop(listenList))} /> : null}
      {everything.length > ready.length && ready.length ? <ListRow icon="music" title="Loop everything" sub={`${count(everything.length)}: yours, then shared, then Listen`} onPress={done(() => player.loop(everything))} /> : null}
      {player.song ? (
        <>
          <ListRow icon="repeat-one" title="Loop this song" sub={player.song.title} onPress={done(() => player.setRepeat("one"))} />
          <Txt variant="cap">Repeat</Txt>
          <ChipRow options={REPEAT_OPTIONS} value={player.repeat} onChange={player.setRepeat} />
          <ListRow icon="stop" title="Stop playing" onPress={done(player.stop)} />
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 6 },
  bar: { flexDirection: "row", alignItems: "center", gap: 12, padding: 8, paddingRight: 6, borderRadius: 18, overflow: "hidden" },
  play: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  track: { position: "absolute", left: 14, right: 14, bottom: 3, height: 3, borderRadius: 2, overflow: "hidden" },
  badge: { position: "absolute", right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  pill: { minHeight: 48, maxWidth: "70%", flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 8, paddingRight: 16, borderRadius: 24 },
  pillDot: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
