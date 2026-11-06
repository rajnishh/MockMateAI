import { router } from "expo-router";
import type { ReactNode } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { api, type Duet, type Film, type RecipeCard, type SentGift, type Song } from "@/lib/api";
import { copyLink, giftMessage, occasionLabel, sendOnWhatsApp } from "@/lib/gifts";
import { KIND_LABEL, type Recording } from "@/lib/hum";
import { reviewHref } from "@/lib/music-video";
import { formatTime } from "@/lib/songs";
import { viewerList } from "@/lib/viewer-list";
import { radius, useTheme } from "@/theme";
import { Icon } from "./icon";
import { confirmDelete, filmStatus } from "./reel-grid";
import { ReelThumb } from "./reel-thumb";
import { SongCover } from "./song-cover";
import { useSongPlayer } from "./song-player";
import { Button, Status, Txt } from "./ui";

// A titled row of cards that scrolls sideways, with "See all", loading cards and Retry.
export function Rail({
  title,
  onSeeAll,
  loading,
  error,
  onRetry,
  skeleton = { width: 112, height: 200 },
  children,
}: {
  title: string;
  onSeeAll?: () => void;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  skeleton?: { width: number; height: number };
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.head}>
        <Txt variant="md" accessibilityRole="header" style={{ flex: 1 }}>
          {title}
        </Txt>
        {onSeeAll ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`See all ${title.toLowerCase()}`} onPress={onSeeAll} style={styles.seeAll}>
            <Txt variant="label" color="tealText">
              See all
            </Txt>
            <Icon name="right" size={16} color={colors.tealText} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <View style={styles.error}>
          <Txt variant="cap" style={{ flex: 1 }}>{`Couldn't load your ${title.replace(/^My /, "").toLowerCase()}.`}</Txt>
          {onRetry ? <Button label="Retry" small kind="ghost" onPress={onRetry} /> : null}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.scroll}>
          {loading
            ? [0, 1, 2].map((i) => <View key={i} accessibilityLabel={i === 0 ? "Loading" : undefined} style={{ width: skeleton.width, height: skeleton.height, borderRadius: radius.md, backgroundColor: colors.surfaceSunken }} />)
            : children}
        </ScrollView>
      )}
    </View>
  );
}

// A reel: ready ones open full screen with the rest of the rail to swipe through.
export function ReelCard({ film, index, list, onDeleted }: { film: Film; index: number; list: Film[]; onDeleted: () => void }) {
  const ready = film.status === "completed" && Boolean(film.videoUrl);
  const open = () => {
    if (ready) {
      viewerList.set(list);
      return router.push(`/watch/${film.id}`);
    }
    router.push(film.status === "completed" ? `/reel/${film.id}` : film.status === "review" ? reviewHref(film) : `/making/${film.id}`);
  };
  const canDelete = film.status === "completed" || film.status === "failed" || film.status === "review";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={ready ? `Play ${film.title ?? "reel"}` : (film.title ?? "Untitled reel")}
      accessibilityHint={canDelete ? "Long-press to delete" : undefined}
      onPress={open}
      onLongPress={canDelete ? () => confirmDelete(film.id, onDeleted, (m) => Alert.alert("Couldn't delete", m)) : undefined}
      style={({ pressed }) => [{ width: 112, gap: 6, opacity: pressed ? 0.85 : 1 }]}>
      <ReelThumb seed={index} width={112} playable={ready} />
      <Txt variant="label" numberOfLines={2}>
        {film.title ?? film.story}
      </Txt>
      {filmStatus(film)}
    </Pressable>
  );
}

// Your own song: tap plays it (the rest of the row is the queue); long-press for loop, queue and gift.
export function OwnSongCard({ song, songs }: { song: Song; songs: Song[] }) {
  const { colors } = useTheme();
  const player = useSongPlayer();
  const ready = Boolean(song.audioUrl);
  const mine = player.current === song.id;
  const playing = mine && player.status.playing;
  const play = () => {
    if (mine) return player.toggle(song);
    const list = songs.filter((s) => s.audioUrl);
    player.playList(list, Math.max(0, list.findIndex((s) => s.id === song.id)));
  };
  const menu = () =>
    Alert.alert(song.title, undefined, [
      { text: "Loop this song", onPress: () => (player.play(song), player.setRepeat("one")) },
      { text: "Play next", onPress: () => player.playNext(song) },
      { text: "Add to queue", onPress: () => player.addToQueue(song) },
      { text: "Open song", onPress: () => router.push(`/songs/${song.id}`) },
      { text: "Gift it", onPress: () => router.push(`/gift/${song.id}`) },
      { text: "Cancel", style: "cancel" },
    ]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={!ready ? `${song.title}, making` : playing ? `Pause ${song.title}` : `Play ${song.title}`}
      accessibilityHint={ready ? "Long-press for loop, queue and gift" : undefined}
      accessibilityActions={ready ? [{ name: "longpress", label: "More" }] : undefined}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === "longpress" && menu()}
      disabled={!ready}
      onPress={play}
      onLongPress={ready ? menu : undefined}
      style={({ pressed }) => [{ width: 128, gap: 6, opacity: pressed ? 0.85 : 1 }]}>
      <View style={[styles.cover, mine && { borderColor: colors.action }]}>
        <SongCover song={song} size={124} radius={radius.md} />
        {mine ? (
          <View style={[styles.badge, { backgroundColor: colors.teal }]}>
            <Txt variant="cap" style={{ color: colors.onTeal, fontSize: 11 }}>
              {playing ? "Playing" : "Paused"}
            </Txt>
          </View>
        ) : null}
      </View>
      <Txt variant="label" numberOfLines={2}>
        {song.title}
      </Txt>
      {ready ? <Txt variant="cap" numberOfLines={1}>{`${formatTime(song.durationSec)} · ${song.language}`}</Txt> : <Status kind="making" text="Making…" />}
    </Pressable>
  );
}

// A "Hum it" recording as a track for the shared player (your own, so it gets the session cookie).
export function trackOfRecording(r: Recording): Song {
  return {
    id: `rec:${r.id}`,
    title: r.title || KIND_LABEL[r.kind],
    genre: "recording",
    mood: "",
    language: "",
    lyrics: "",
    durationSec: r.durationSec,
    status: "completed",
    myVoice: true,
    edited: false,
    contentCredentials: false,
    error: null,
    createdAt: r.createdAt,
    audioUrl: `/api/voice/takes/${r.id}/audio`,
  };
}

export function ClipCard({ recording, onMore }: { recording: Recording; onMore: () => void }) {
  const { colors } = useTheme();
  const player = useSongPlayer();
  const track = trackOfRecording(recording);
  const mine = player.current === track.id;
  const date = new Date(recording.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={mine && player.status.playing ? `Pause ${track.title}` : `Play ${track.title}`}
      accessibilityHint="Long-press to make something with it"
      onPress={() => player.toggle(track)}
      onLongPress={onMore}
      style={({ pressed }) => [styles.tile, { width: 160, minHeight: 88, backgroundColor: colors.surfaceRaised, borderColor: mine ? colors.action : colors.line, opacity: pressed ? 0.85 : 1 }]}>
      <View style={[styles.dot, { backgroundColor: colors.tealTint }]}>
        <Icon name="mic" size={18} color={colors.tealText} />
      </View>
      <Txt variant="label" numberOfLines={1}>
        {track.title}
      </Txt>
      <Txt variant="cap" numberOfLines={1}>{`${formatTime(recording.durationSec)} · ${KIND_LABEL[recording.kind]} · ${date}`}</Txt>
    </Pressable>
  );
}

const DUET_LINE: Record<Duet["phase"], (d: Duet) => string> = {
  recording_a: (d) => (d.role === "a" ? "Sing your part" : "Waiting for their part"),
  waiting: (d) => (d.role === "a" ? `Waiting for ${d.partnerName || (d.invitedIg ? `@${d.invitedIg}` : "your partner")}` : "Waiting"),
  joining: () => "Joining your parts",
  join_failed: () => "Couldn't join. Try again",
  ready: () => "Ready to post",
  solo: () => "Solo song ready",
  expired: () => "Invite ran out",
  declined: () => "Said no this time",
  cancelled: () => "Cancelled",
};

export function DuetCard({ duet }: { duet: Duet }) {
  const { colors } = useTheme();
  const names = [duet.starterName, duet.partnerName || duet.invitedIg].filter(Boolean);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Jugalbandi: ${duet.topic}. ${DUET_LINE[duet.phase](duet)}`}
      onPress={() => router.push(`/duets/${duet.id}`)}
      style={({ pressed }) => [styles.tile, { width: 160, minHeight: 112, backgroundColor: colors.surfaceRaised, borderColor: colors.line, opacity: pressed ? 0.85 : 1 }]}>
      <View style={{ flexDirection: "row" }}>
        {names.map((n, i) => (
          <View key={i} style={[styles.initial, { backgroundColor: i ? colors.coralTint : colors.tealTint, marginLeft: i ? -8 : 0, borderColor: colors.surfaceRaised }]}>
            <Txt variant="label" style={{ fontSize: 13 }}>
              {n.slice(0, 1).toUpperCase()}
            </Txt>
          </View>
        ))}
      </View>
      <Txt variant="label" numberOfLines={2}>
        {duet.topic || "Jugalbandi"}
      </Txt>
      <Txt variant="cap" numberOfLines={1}>
        {DUET_LINE[duet.phase](duet)}
      </Txt>
    </Pressable>
  );
}

// A song you gifted: tap plays its song; long-press sends it again.
export function GiftCard({ gift, song }: { gift: SentGift; song?: Song }) {
  const { colors } = useTheme();
  const player = useSongPlayer();
  const play = () => (song?.audioUrl ? player.toggle(song) : router.push(`/songs/${gift.songId}`));
  const menu = () =>
    Alert.alert(`To ${gift.toName}`, gift.songTitle, [
      { text: "Send again on WhatsApp", onPress: () => sendOnWhatsApp(giftMessage(gift.toName, gift.occasion, gift.url)).catch(() => undefined) },
      { text: "Copy link", onPress: () => copyLink(gift.url).catch(() => undefined) },
      { text: "Cancel", style: "cancel" },
    ]);
  const seen = gift.opened ? (gift.playCount ? `Opened · played ${gift.playCount} ${gift.playCount === 1 ? "time" : "times"}` : "Opened") : "Not opened yet";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Gift to ${gift.toName}, ${gift.songTitle}. ${seen}. Plays the song`}
      accessibilityHint="Long-press to send it again"
      onPress={play}
      onLongPress={menu}
      style={({ pressed }) => [styles.tile, { width: 160, minHeight: 112, backgroundColor: colors.surfaceRaised, borderColor: colors.line, opacity: pressed ? 0.85 : 1 }]}>
      <View style={[styles.dot, { backgroundColor: colors.coralTint }]}>
        <Icon name="gift" size={18} color={colors.ink} />
      </View>
      <Txt variant="label" numberOfLines={1}>{`To ${gift.toName} · ${occasionLabel(gift.occasion)}`}</Txt>
      <Txt variant="cap" numberOfLines={1}>
        {gift.songTitle}
      </Txt>
      <Txt variant="cap" numberOfLines={1}>
        {seen}
      </Txt>
    </Pressable>
  );
}

export function RecipeTile({ recipe, index }: { recipe: RecipeCard; index: number }) {
  const poster = api.recipePosterUrl(recipe.posterUrl);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Recipe ${recipe.name}, used ${recipe.useCount} times`}
      onPress={() => router.push(`/recipes/${recipe.publicId}`)}
      style={({ pressed }) => [{ width: 112, gap: 6, opacity: pressed ? 0.85 : 1 }]}>
      {poster ? <Image source={{ uri: poster }} style={styles.poster} accessibilityIgnoresInvertColors /> : <ReelThumb seed={index + 2} width={112} />}
      <Txt variant="label" numberOfLines={2}>
        {recipe.name}
      </Txt>
      <Txt variant="cap">{`${recipe.useCount} ${recipe.useCount === 1 ? "use" : "uses"}`}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  seeAll: { minHeight: 44, minWidth: 44, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 2 },
  error: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  // Rails run to the screen's edge, past Screen's 16 pt padding.
  bleed: { marginRight: -16 },
  scroll: { gap: 12, paddingRight: 16 },
  cover: { borderRadius: radius.md + 2, borderWidth: 2, borderColor: "transparent" },
  badge: { position: "absolute", left: 6, bottom: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  tile: { borderRadius: radius.md, borderWidth: 1, padding: 12, gap: 4 },
  dot: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  initial: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  poster: { width: 112, aspectRatio: 9 / 16, borderRadius: radius.md },
});
