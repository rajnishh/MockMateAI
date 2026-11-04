import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { api, type Song } from "@/lib/api";
import { formatTime } from "@/lib/songs";
import { useTheme } from "@/theme";
import { Icon } from "./icon";
import { ProgressBar, Txt } from "./ui";

// One player for a screen: starting another song stops the one playing.
export function useSongPlayer() {
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    // Songs play even with the ring/silent switch off, like other music apps.
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
  }, []);

  async function toggle(song: Song) {
    if (current === song.id) {
      if (status.playing) return player.pause();
      if (status.duration > 0 && status.currentTime >= status.duration - 0.25) await player.seekTo(0);
      return player.play();
    }
    const uri = api.songAudioUrl(song);
    if (!uri) return;
    // The audio route needs the session cookie, like the reel videos.
    player.replace({ uri, headers: await api.videoHeaders() });
    setCurrent(song.id);
    player.play();
  }

  return { current, status, toggle, seekTo: (sec: number) => player.seekTo(sec) };
}

export type SongPlayer = ReturnType<typeof useSongPlayer>;

// A round play/pause button with the song's progress and time next to it.
export function SongPlayerRow({ song, player }: { song: Song; player: SongPlayer }) {
  const { colors } = useTheme();
  const mine = player.current === song.id;
  const playing = mine && player.status.playing;
  const loading = mine && !player.status.isLoaded;
  const duration = mine && player.status.duration > 0 ? player.status.duration : song.durationSec;
  const at = mine ? player.status.currentTime : 0;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? `Pause ${song.title}` : `Play ${song.title}`}
        disabled={!song.audioUrl}
        onPress={() => player.toggle(song)}
        hitSlop={6}
        style={[styles.play, { backgroundColor: song.audioUrl ? colors.action : colors.surfaceSunken }]}>
        {loading ? <ActivityIndicator color={colors.onAction} /> : playing ? <PauseGlyph color={colors.onAction} /> : <Icon name="play" size={20} color={colors.onAction} />}
      </Pressable>
      <View style={{ flex: 1, gap: 6 }}>
        <ProgressBar value={duration ? at / duration : 0} />
        <Txt variant="mono" color="inkMuted">
          {`${formatTime(at)} / ${formatTime(duration)}`}
        </Txt>
      </View>
    </View>
  );
}

function PauseGlyph({ color }: { color: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      <View style={[styles.bar, { backgroundColor: color }]} />
      <View style={[styles.bar, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  play: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  bar: { width: 5, height: 18, borderRadius: 2 },
});
