import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Share, StyleSheet, View } from "react-native";

import { PushOffer } from "@/components/push-offer";
import { SongCover } from "@/components/song-cover";
import { SongPlayerRow, useSongPlayer } from "@/components/song-player";
import { StudioEdit } from "@/components/studio-edit";
import { FALLBACK_PRESETS, StudioMix } from "@/components/studio-mix";
import { fallbackKinds, StudioRemix } from "@/components/studio-remix";
import { Icon } from "@/components/icon";
import { Banner, Button, Card, Header, Row, Screen, Skeleton, Txt } from "@/components/ui";
import type { Range } from "@/components/waveform";
import { api, type Song } from "@/lib/api";
import { plays } from "@/lib/listen";
import { formatTime, genreLabel, shareSong } from "@/lib/songs";
import { useData } from "@/lib/use-data";
import { radius, useTheme } from "@/theme";

type Tab = "mix" | "remix" | "edit";
const TABS: { value: Tab; label: string }[] = [
  { value: "mix", label: "Mix" },
  { value: "remix", label: "Remix" },
  { value: "edit", label: "Edit" },
];

// The Studio: one screen per song with Mix, Remix and Edit. Everything is saved as a new song.
export default function SongScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const song = useData(() => api.song(id));
  const studio = useData(() => api.songs());
  const player = useSongPlayer();
  const [tab, setTab] = useState<Tab>("mix");
  const [peaks, setPeaks] = useState<number[] | null>(null);
  // The part being played, and where it stops (a ref, so stopping doesn't re-render).
  const [part, setPart] = useState<Range | null>(null);
  const stopAt = useRef<number | null>(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = song.data;
  const ready = s?.status === "completed";
  const mine = s && player.current === s.id;
  const position = mine ? player.status.currentTime : undefined;

  // A new mix or remix opens while it's still being made; check until it's ready.
  useEffect(() => {
    if (!s || s.status === "completed" || s.status === "failed") return;
    const t = setTimeout(song.reload, 4000);
    return () => clearTimeout(t);
  }, [s, song.reload]);

  useEffect(() => {
    if (!ready) return;
    api.songPeaks(id).then(setPeaks, () => undefined);
  }, [id, ready]);

  // A picked part plays once, then stops at its end.
  useEffect(() => {
    if (s && stopAt.current !== null && mine && player.status.playing && player.status.currentTime >= stopAt.current) {
      stopAt.current = null;
      player.toggle(s);
    }
  }, [s, mine, player]);

  async function playPart(r: Range | null) {
    if (!s) return;
    setPart(r);
    stopAt.current = r?.end ?? null;
    if (!r) return pauseSong();
    if (!mine) await player.toggle(s);
    await player.seekTo(r.start);
    if (mine && !player.status.playing) await player.toggle(s);
  }

  function pauseSong() {
    if (s && mine && player.status.playing) player.toggle(s);
  }

  async function share() {
    if (!s) return;
    setSharing(true);
    setError(null);
    try {
      await shareSong(s);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSharing(false);
    }
  }

  // Mixes, remixes and edits are new songs: open the new one (it shows while it's being made).
  const opened = (newId: string) => {
    pauseSong();
    router.replace({ pathname: "/songs/[id]", params: { id: newId } });
  };

  const kinds = studio.data?.remixKinds ?? fallbackKinds(studio.data?.remixCredits ?? { cover: 2, extend: 2, replace: 1, rap: 1 });
  const playingPart = Boolean(part && mine && player.status.playing);

  return (
    <Screen>
      <Header title={s?.title ?? "Your song"} sub={s ? ["Studio", genreLabel(s.genre), formatTime(s.durationSec)].join(" · ") : undefined} back="/songs" />
      {song.error ? <Banner kind="error" text={song.error} action={<Button label="Retry" small kind="secondary" onPress={song.reload} />} /> : null}
      {!s ? (
        <Skeleton height={160} />
      ) : !ready ? (
        <Card>
          <View style={styles.making}>
            {s.status === "failed" ? null : <ActivityIndicator color={colors.brand} />}
            <Txt variant="md">{s.status === "failed" ? "This one didn't work" : "Making your song…"}</Txt>
            <Txt variant="cap" style={{ textAlign: "center" }}>
              {s.status === "failed" ? `${s.error ?? "Something went wrong"}. Any credits were refunded.` : "It takes a minute or two. You can leave; it'll be in My songs."}
            </Txt>
          </View>
        </Card>
      ) : (
        <>
          <View style={{ alignItems: "center" }}>
            <SongCover song={s} size={240} />
          </View>
          {/* The player slot (components/song-player.tsx). */}
          <Card>
            <SongPlayerRow song={s} player={player} />
          </Card>
          <ListenCard song={s} reload={song.reload} />
          <PushOffer what="song" />
          <Button label="Make it a gift" icon="gift" block disabled={s.status === "failed"} onPress={() => router.push({ pathname: "/gift/[songId]", params: { songId: s.id } })} />
          <Button label="Save or share" icon="share" kind="secondary" block loading={sharing} disabled={!s.audioUrl} onPress={share} />
          {error ? <Banner kind="error" text={error} /> : null}
          <Button label="Make music video" icon="film" kind="secondary" block disabled={s.status !== "completed"} onPress={() => router.push(`/songs/video/${s.id}`)} />

          <View style={[styles.tabs, { backgroundColor: colors.surfaceSunken }]} accessibilityRole="tablist">
            {TABS.map((t) => {
              const on = tab === t.value;
              return (
                <Pressable
                  key={t.value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    setPart(null);
                    setTab(t.value);
                  }}
                  style={[styles.tab, on ? { backgroundColor: colors.surfaceRaised, shadowColor: "#2a1235", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } } : null]}>
                  <Txt variant="label" color={on ? "ink" : "inkMuted"}>
                    {t.label}
                  </Txt>
                </Pressable>
              );
            })}
          </View>

          <Card>
            {tab === "mix" ? (
              <StudioMix
                song={s}
                presets={studio.data?.soundPresets ?? FALLBACK_PRESETS}
                stemsCredits={studio.data?.stemsCredits ?? 1}
                position={position ?? 0}
                pauseSong={pauseSong}
                onSaved={opened}
              />
            ) : tab === "remix" ? (
              studio.data?.available === false ? (
                <Txt>Remixing isn&apos;t set up on this server yet.</Txt>
              ) : (
                <StudioRemix song={s} kinds={kinds} peaks={peaks} position={position} playingPart={playingPart} playPart={playPart} onDone={opened} />
              )
            ) : (
              <StudioEdit song={s} peaks={peaks} position={position} playingPart={playingPart} playPart={playPart} onDone={opened} />
            )}
          </Card>

          {s.lyrics && tab !== "remix" ? (
            <Card flat>
              <Txt variant="md">Lyrics</Txt>
              <Txt selectable>{s.lyrics}</Txt>
            </Card>
          ) : null}
          {s.contentCredentials ? <Txt variant="cap">Content Credentials: marked as AI-generated.</Txt> : null}
        </>
      )}
    </Screen>
  );
}

// "Share on Listen": private, public (with plays and likes), or removed after a report.
function ListenCard({ song, reload }: { song: Song; reload: () => void }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const l = song.listen;
  if (!l) return null;
  if (l.state === "taken_down") return <Banner kind="warn" title="Removed from Listen" text="This song was taken down after a report, so it can't be public again." />;
  if (l.state === "private") {
    return (
      <Card>
        <Row style={{ alignItems: "center", gap: 12 }}>
          <Icon name="headphones" color={colors.tealText} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="label">Share on Listen</Txt>
            <Txt variant="cap">Private. Publish it so everyone can hear it, in the Listen tab and by link.</Txt>
          </View>
        </Row>
        <Button label="Publish" icon="globe" block onPress={() => router.push({ pathname: "/songs/publish/[id]", params: { id: song.id } })} />
      </Card>
    );
  }
  const makePrivate = () =>
    Alert.alert("Make this song private?", "It leaves Listen and its link stops working. You can publish it again later; the link comes back.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Make private",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          await api.unpublishSong(song.id).catch(() => undefined);
          setBusy(false);
          reload();
        },
      },
    ]);
  const link = l.publicId ? api.publicSongLink(l.publicId) : null;
  return (
    <Card>
      <Row style={{ alignItems: "center", gap: 12 }}>
        <Icon name="headphones" color={colors.tealText} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="label">Public on Listen</Txt>
          <Txt variant="cap">{`${plays(l.playCount)} · ${l.likeCount} ${l.likeCount === 1 ? "like" : "likes"} · ${l.dislikeCount} Not for me (only you see this)`}</Txt>
        </View>
      </Row>
      <Row style={{ gap: 8 }}>
        <Button label="Share link" icon="share" kind="secondary" small style={{ flex: 1 }} disabled={!link} onPress={() => link && Share.share({ message: `Listen to my song “${song.title}” on Reelkar ${link}`, url: link }).catch(() => undefined)} />
        <Button label="See it" kind="secondary" small style={{ flex: 1 }} onPress={() => l.publicId && router.push({ pathname: "/s/[id]", params: { id: l.publicId } })} />
      </Row>
      <Button label="Make private" kind="ghost" small loading={busy} onPress={makePrivate} />
    </Card>
  );
}

const styles = StyleSheet.create({
  making: { alignItems: "center", gap: 10, paddingVertical: 16 },
  tabs: { flexDirection: "row", padding: 4, borderRadius: radius.pill, gap: 4 },
  tab: { flex: 1, minHeight: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});
