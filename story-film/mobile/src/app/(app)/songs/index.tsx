import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { Icon } from "@/components/icon";
import { MiniPlayer } from "@/components/mini-player";
import { SongCover } from "@/components/song-cover";
import { PauseGlyph, PlayGlyph, type SongPlayer, useSongPlayer } from "@/components/song-player";
import { Banner, Button, Credits, Empty, Header, Screen, Skeleton, Status, Txt } from "@/components/ui";
import { api, type Song } from "@/lib/api";
import { formatTime, genreLabel, songMaking } from "@/lib/songs";
import { useData } from "@/lib/use-data";
import { fonts, radius, useTheme } from "@/theme";

// Song Studio: the creator's songs, newest first. Refreshes while songs are being made.
export default function Songs() {
  const studio = useData(() => api.songs());
  const billing = useData(() => api.billing());
  const player = useSongPlayer();
  const songs = studio.data?.songs ?? [];
  const making = songs.some(songMaking);
  const { reload } = studio;

  useEffect(() => {
    if (!making) return;
    const t = setTimeout(reload, 5000);
    return () => clearTimeout(t);
  }, [making, studio.data, reload]);

  return (
    <Screen
      footer={
        songs.length > 0 || player.song ? (
          <View style={{ gap: 10, marginHorizontal: -12 }}>
            <MiniPlayer />
            {songs.length > 0 ? (
              <View style={{ paddingHorizontal: 12 }}>
                <Button label="New song" icon="music" block disabled={studio.data?.available === false} onPress={() => router.push("/songs/new")} />
              </View>
            ) : null}
          </View>
        ) : undefined
      }>
      <Header title="Song Studio" sub="Songs sung in Hindi, Hinglish and more" back right={<Credits count={billing.data?.balance ?? null} />} />
      {studio.data?.available === false ? <Banner kind="warn" text="Song Studio isn't set up on this server yet." /> : null}
      {studio.error ? <Banner kind="error" title="Couldn't load your songs" text={studio.error} action={<Button label="Retry" small kind="secondary" onPress={reload} />} /> : null}
      {studio.loading && !studio.data ? (
        <>
          <Skeleton height={88} />
          <Skeleton height={88} />
          <Skeleton height={88} />
        </>
      ) : studio.data && songs.length === 0 ? (
        <Empty
          title="No songs yet"
          text="Write a song about anything and hear it sung. Two versions in about a minute."
          action={<Button label="Make my first song" icon="music" style={{ alignSelf: "center" }} onPress={() => router.push("/songs/new")} />}
        />
      ) : (
        <>
          <Txt variant="md">My songs</Txt>
          <View style={{ gap: 10 }}>
            {songs.map((s) => (
              <SongCard key={s.id} song={s} player={player} />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

// A song row: cover art you tap to play, the title, and its details. The row opens the song's page.
function SongCard({ song, player }: { song: Song; player: SongPlayer }) {
  const { colors } = useTheme();
  const done = song.status === "completed";
  const mine = player.current === song.id;
  const playing = mine && player.status.playing;
  const loading = mine && !player.status.isLoaded;
  const duration = mine && player.status.duration > 0 ? player.status.duration : song.durationSec;
  const meta = [genreLabel(song.genre), formatTime(song.durationSec), song.edited ? "Edited" : null, song.myVoice ? "My voice" : null].filter(Boolean).join(" · ");

  return (
    <Pressable
      accessibilityRole={done ? "button" : undefined}
      accessibilityLabel={done ? `${song.title}, ${meta}. Opens the song` : undefined}
      onPress={done ? () => router.push(`/songs/${song.id}`) : undefined}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: mine ? colors.surfaceSunken : colors.surfaceRaised, borderColor: mine ? colors.brand : colors.line, opacity: pressed ? 0.9 : 1 },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? `Pause ${song.title}` : `Play ${song.title}`}
        disabled={!song.audioUrl}
        onPress={() => player.toggle(song)}
        hitSlop={4}>
        <SongCover song={song} size={72} radius={14} />
        {done ? (
          <View style={styles.overlay}>
            <View style={[styles.playDot, { backgroundColor: playing ? colors.pop : "rgba(26, 11, 32, 0.62)" }]}>
              {loading ? <ActivityIndicator color="#fff1e6" size="small" /> : playing ? <PauseGlyph color={colors.onPop} size={13} /> : <PlayGlyph color="#fff1e6" size={16} />}
            </View>
          </View>
        ) : null}
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <Txt variant="label" numberOfLines={2}>
          {song.title}
        </Txt>
        {done ? (
          <>
            <Txt variant="cap" numberOfLines={1}>
              {meta}
            </Txt>
            {mine ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Open the full player" onPress={() => router.push(`/songs/play/${song.id}`)} hitSlop={8} style={styles.nowRow}>
                <View style={[styles.track, { backgroundColor: colors.line }]}>
                  <View style={{ width: `${duration ? Math.min(100, (player.status.currentTime / duration) * 100) : 0}%`, height: "100%", backgroundColor: colors.brand }} />
                </View>
                <Txt variant="cap" style={{ color: colors.brandText, fontFamily: fonts.semibold }}>
                  Full screen
                </Txt>
              </Pressable>
            ) : null}
          </>
        ) : song.status === "failed" ? (
          <>
            <Status kind="error" text="Failed · credits refunded" />
            {song.error ? <Txt variant="cap">{song.error}</Txt> : null}
          </>
        ) : (
          <Status kind="making" text="Making your song… about a minute" />
        )}
      </View>
      {done ? <Icon name="right" size={18} color={colors.inkMuted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 14, padding: 10, paddingRight: 12, borderRadius: radius.lg, borderWidth: 1.5 },
  overlay: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  playDot: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  nowRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 28 },
  track: { flex: 1, height: 4, borderRadius: 2, overflow: "hidden" },
});
