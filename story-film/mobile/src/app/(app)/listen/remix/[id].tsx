import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Icon } from "@/components/icon";
import { SongCover } from "@/components/song-cover";
import { useSongPlayer } from "@/components/song-player";
import { StudioRemix } from "@/components/studio-remix";
import { Banner, Button, Card, Header, Screen, Sheet, Skeleton, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { publicTrackSong } from "@/lib/listen";
import { blockedText, earnPercent, OPEN_KIND_TEXT } from "@/lib/remixes";
import { HowEarning } from "@/components/remix-family";
import { useData } from "@/lib/use-data";
import { radius, useTheme } from "@/theme";
import type { Range } from "@/components/waveform";

const credits = (n: number) => `${n} ${n === 1 ? "credit" : "credits"}`;

// Remix someone's public song (design/community/remix-spec.md X2-X5): pick what to make (the kinds
// and prices the server opens on it), see who gets the credit, make it. Saved as your own new song,
// which always says "A remix of X by @y"; its maker earns a share of the paid credits it spends.
export default function RemixPublicSong() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const player = useSongPlayer();
  const page = useData(() => api.publicSong(id));
  const billing = useData(() => api.billing());
  const voices = useData(() => api.myVoices());
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [part, setPart] = useState<Range | null>(null);
  const [how, setHow] = useState(false);
  const stopAt = useRef<number | null>(null);
  const s = page.data?.song;
  const track = s ? publicTrackSong(s) : null;
  const mine = track && player.current === track.id;

  useEffect(() => {
    api.songAnalysis(id).then((a) => setPeaks(a.peaks), () => undefined);
  }, [id]);

  // A picked part plays once, then stops at its end.
  useEffect(() => {
    if (track && stopAt.current !== null && mine && player.status.playing && player.status.currentTime >= stopAt.current) {
      stopAt.current = null;
      player.toggle(track);
    }
  }, [track, mine, player]);

  async function playPart(r: Range | null) {
    if (!track) return;
    setPart(r);
    stopAt.current = r?.end ?? null;
    if (!r) {
      if (mine && player.status.playing) player.toggle(track);
      return;
    }
    if (!mine) await player.toggle(track);
    await player.seekTo(r.start);
    if (mine && !player.status.playing) await player.toggle(track);
  }

  const remix = page.data?.remix;
  // Older servers: covers only, as Listen phase 1 did.
  const kinds = (remix?.kinds ?? []).map((k) => ({ ...k, ...(OPEN_KIND_TEXT[k.kind] ? { label: OPEN_KIND_TEXT[k.kind].label, help: OPEN_KIND_TEXT[k.kind].help } : {}) }));
  const blocked = remix?.blocked ?? (s && !s.allowRemix ? "off" : null);
  const rate = earnPercent(page.data?.earnRateBp ?? 1000);
  const balance = billing.data?.balance;

  return (
    <Screen>
      <Header title="Remix" sub={s ? `${s.title} · @${s.handle}` : undefined} back />
      {page.error ? <Banner kind="error" text={page.error} action={<Button label="Back to the song" small kind="secondary" onPress={() => router.back()} />} /> : null}
      {!s || !track ? (
        page.error ? null : (
          <>
            <Skeleton height={96} />
            <Skeleton height={140} />
          </>
        )
      ) : (
        <>
          <View style={[styles.header, { backgroundColor: colors.deep }]}>
            <SongCover song={track} size={64} radius={radius.md} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="over" style={{ color: colors.onDeep, opacity: 0.8 }}>
                Remixing
              </Txt>
              <Txt variant="label" numberOfLines={2} style={{ color: colors.onDeep }}>
                {s.title}
              </Txt>
              <Txt variant="cap" style={{ color: colors.onDeep, opacity: 0.8 }}>{`⁨@${s.handle}⁩`}</Txt>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={mine && player.status.playing ? "Pause the original" : "Play the original"}
              onPress={() => player.toggle(track)}
              style={[styles.play, { backgroundColor: colors.action }]}>
              <Icon name={mine && player.status.playing ? "stop" : "play"} size={22} color={colors.onAction} />
            </Pressable>
          </View>

          {blocked ? (
            <>
              <Banner kind="info" text={blockedText(blocked, s.handle)} />
              <Button label="Back to the song" kind="secondary" block onPress={() => router.back()} />
            </>
          ) : !kinds.length ? (
            <Txt>Remixing isn&apos;t set up on this server yet.</Txt>
          ) : (
            <>
              <Txt variant="md" accessibilityRole="header">
                What do you want to make?
              </Txt>
              <Card>
                <StudioRemix
                  song={track}
                  kinds={kinds}
                  peaks={peaks}
                  position={mine ? player.status.currentTime : undefined}
                  playingPart={Boolean(part) && Boolean(mine) && player.status.playing}
                  playPart={playPart}
                  primaryLabel={(k) => `${OPEN_KIND_TEXT[k.kind]?.verb ?? k.label} · ${credits(k.credits)}`}
                  footnote={balance !== undefined ? `You have ${credits(balance)}. Nothing is charged if it fails.` : "Nothing is charged if it fails."}
                  onDone={(newId) => {
                    player.pause();
                    router.replace({ pathname: "/songs/[id]", params: { id: newId } });
                  }}
                />
              </Card>
              <View style={[styles.credit, { backgroundColor: colors.tealTint }]}>
                <Icon name="heart" size={22} color={colors.tealText} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Txt variant="label">{`Credit goes to ⁨@${s.handle}⁩`}</Txt>
                  <Txt variant="cap" color="ink">{`Your remix says "A remix of ${s.title} by @${s.handle}". They earn a share of the credits you spend.`}</Txt>
                  <Pressable accessibilityRole="button" onPress={() => setHow(true)} hitSlop={8} style={{ minHeight: 44, justifyContent: "center" }}>
                    <Txt variant="label" color="tealText">
                      How earning works
                    </Txt>
                  </Pressable>
                </View>
              </View>
              {voices.data?.length ? <Txt variant="cap">Remixes use AI singers. You can make a version in your own voice after.</Txt> : null}
            </>
          )}
        </>
      )}
      <Sheet visible={how} onClose={() => setHow(false)}>
        <HowEarning rate={rate} />
        <Button label="Got it" block onPress={() => setHow(false)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: radius.lg, padding: 14 },
  play: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  credit: { flexDirection: "row", gap: 12, borderRadius: radius.md, padding: 14 },
});
