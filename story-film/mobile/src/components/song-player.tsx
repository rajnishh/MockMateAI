import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { SvgXml } from "react-native-svg";

import { api, type Song, type SongAnalysis } from "@/lib/api";
import { formatTime } from "@/lib/songs";
import { useTheme } from "@/theme";
import { Icon } from "./icon";
import { ProgressBar, Txt } from "./ui";

function usePlayerState() {
  const player = useAudioPlayer(null, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const [song, setSong] = useState<Song | null>(null);

  useEffect(() => {
    // Songs play even with the ring/silent switch off, like other music apps.
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
  }, []);

  const play = useCallback(
    async (next: Song) => {
      if (song?.id === next.id) {
        if (status.duration > 0 && status.currentTime >= status.duration - 0.25) await player.seekTo(0);
        return player.play();
      }
      const uri = api.songAudioUrl(next);
      if (!uri) return;
      // The audio route needs the session cookie, like the reel videos.
      player.replace({ uri, headers: await api.videoHeaders() });
      setSong(next);
      player.play();
    },
    [player, song?.id, status.currentTime, status.duration],
  );

  return useMemo(
    () => ({
      current: song?.id ?? null,
      song,
      status,
      play,
      pause: () => player.pause(),
      toggle: (s: Song) => (song?.id === s.id && status.playing ? player.pause() : play(s)),
      seekTo: (sec: number) => player.seekTo(Math.max(0, sec)),
      // ±10 s, kept inside the song.
      skip: (sec: number) => player.seekTo(Math.min(Math.max(0, status.currentTime + sec), Math.max(0, (status.duration || song?.durationSec || 0) - 0.5))),
      stop: () => {
        player.pause();
        setSong(null);
      },
    }),
    [player, play, song, status],
  );
}

export type SongPlayer = ReturnType<typeof usePlayerState>;

const PlayerContext = createContext<SongPlayer | null>(null);

// One player for the whole signed-in app: it keeps playing across screens, and starting a song stops the last one.
export function SongPlayerProvider({ children }: { children: ReactNode }) {
  const value = usePlayerState();
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function useSongPlayer(): SongPlayer {
  const p = useContext(PlayerContext);
  if (!p) throw new Error("useSongPlayer must be used inside SongPlayerProvider");
  return p;
}

// Beats, loudness and lyric timing, worked out once on the server; kept for the session.
const analyses = new Map<string, Promise<SongAnalysis>>();
export function useSongAnalysis(songId: string | null | undefined): SongAnalysis | null {
  const [data, setData] = useState<{ id: string; a: SongAnalysis } | null>(null);
  useEffect(() => {
    if (!songId) return;
    let live = true;
    let job = analyses.get(songId);
    if (!job) {
      job = api.songAnalysis(songId);
      analyses.set(songId, job);
      // A failure isn't cached, so the next open tries again.
      job.catch(() => analyses.delete(songId));
    }
    job.then((a) => live && setData({ id: songId, a })).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [songId]);
  return data && data.id === songId ? data.a : null;
}

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

export function PauseGlyph({ color, size = 18 }: { color: string; size?: number }) {
  const w = Math.max(3, Math.round(size * 0.28));
  return (
    <View style={{ flexDirection: "row", gap: w * 0.8 }}>
      <View style={{ width: w, height: size, borderRadius: 2, backgroundColor: color }} />
      <View style={{ width: w, height: size, borderRadius: 2, backgroundColor: color }} />
    </View>
  );
}

// A filled play triangle, nudged right so it looks centred in a round button.
export function PlayGlyph({ color, size = 20 }: { color: string; size?: number }) {
  return <SvgXml xml={`<svg viewBox="0 0 24 24"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.4-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" fill="${color}"/></svg>`} width={size} height={size} style={{ marginLeft: size * 0.12 }} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  play: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
});
