import { router } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { genreLabel } from "@/lib/songs";
import { fonts, useTheme } from "@/theme";
import { Icon } from "./icon";
import { SongCover } from "./song-cover";
import { PauseGlyph, PlayGlyph, useSongPlayer } from "./song-player";
import { Txt } from "./ui";

// The song that's playing, above the tab bar. Tap to open the full player; nothing shows when no song is loaded.
export function MiniPlayer() {
  const { colors, mode } = useTheme();
  const player = useSongPlayer();
  const song = player.song;
  if (!song) return null;
  const { status } = player;
  const duration = status.duration > 0 ? status.duration : song.durationSec;
  const progress = duration ? Math.min(1, status.currentTime / duration) : 0;
  const muted = "rgba(255, 241, 230, 0.68)";
  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Now playing ${song.title}. Opens the player`}
        onPress={() => router.push(`/songs/play/${song.id}`)}
        style={({ pressed }) => [styles.bar, { backgroundColor: mode === "dark" ? colors.surfaceOverlay : colors.deep, opacity: pressed ? 0.92 : 1 }]}>
        <SongCover song={song} size={42} radius={10} />
        <View style={{ flex: 1, gap: 1 }}>
          <Txt variant="label" numberOfLines={1} style={{ color: colors.onDeep }}>
            {song.title}
          </Txt>
          <Txt variant="cap" numberOfLines={1} style={{ color: muted, fontFamily: fonts.medium, fontSize: 12 }}>
            {song.handle ? `@${song.handle} · ${genreLabel(song.genre)}` : genreLabel(song.genre)}
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
        {player.upNext.length ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Next song" onPress={player.next} hitSlop={8} style={styles.close}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 6 },
  bar: { flexDirection: "row", alignItems: "center", gap: 12, padding: 8, paddingRight: 6, borderRadius: 18, overflow: "hidden" },
  play: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  close: { width: 40, height: 44, alignItems: "center", justifyContent: "center" },
  track: { position: "absolute", left: 14, right: 14, bottom: 3, height: 3, borderRadius: 2, overflow: "hidden" },
});
