import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, Share, StyleSheet, Switch, View } from "react-native";

import { Icon } from "@/components/icon";
import { SongCover } from "@/components/song-cover";
import { useSongPlayer } from "@/components/song-player";
import { RemixFamily } from "@/components/remix-family";
import { SongRail } from "@/components/song-rail";
import { Banner, Button, Card, Empty, Header, ListRow, Row, Screen, Sheet, Skeleton, Txt, Win } from "@/components/ui";
import { api, type Reaction } from "@/lib/api";
import { plays, publicTrackSong, REACTIONS } from "@/lib/listen";
import { creditAmount, remixWord } from "@/lib/remixes";
import { formatTime } from "@/lib/songs";
import { useData } from "@/lib/use-data";
import { radius, useTheme } from "@/theme";

// A public song: play, lyrics, plays, Like / Not for me, one reaction, its remix family, two rails,
// Remix, Share and Report. The maker sees their remix numbers and the Allow remixes switch.
export default function SongPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const player = useSongPlayer();
  const page = useData(() => api.publicSong(id));
  const p = page.data;
  const s = p?.song;
  // Taps show at once; the server's values take over when the page reloads.
  const [mine, setMine] = useState<{ id: string; vote: -1 | 0 | 1; likes: number; reaction: Reaction | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The maker's Allow remixes switch: shown at once, "Stop new remixes?" asks before turning it off.
  const [allow, setAllow] = useState<{ id: string; on: boolean } | null>(null);
  const [stopping, setStopping] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const local = s && mine?.id === s.publicId ? mine : s ? { id: s.publicId, vote: s.myVote, likes: s.likeCount, reaction: s.myReaction } : null;
  const vote = local?.vote ?? 0;
  const likes = local?.likes ?? 0;
  const reaction = local?.reaction ?? null;

  const gone = page.error && (page.error.includes("private") || page.error.includes("removed"));
  if (!s) {
    return (
      <Screen>
        <Header title="Song" back />
        {gone ? (
          <Empty title={page.error!} text="It may come back if its maker publishes it again." action={<Button label="Back to Listen" onPress={() => router.replace("/listen")} />} />
        ) : page.error ? (
          <Banner kind="error" text={page.error} action={<Button label="Retry" small kind="secondary" onPress={page.reload} />} />
        ) : (
          <Skeleton height={320} />
        )}
      </Screen>
    );
  }

  const track = publicTrackSong(s);
  const playingThis = player.song?.publicId === s.publicId;
  const playing = playingThis && player.status.playing;

  async function doVote(value: 1 | -1) {
    const next = vote === value ? 0 : value;
    setMine({ id: s!.publicId, vote: next, likes: likes + (next === 1 ? 1 : 0) - (vote === 1 ? 1 : 0), reaction });
    api.voteSong(s!.publicId, next).catch((e: Error) => setError(e.message));
  }

  async function doReact(kind: Reaction) {
    const next = reaction === kind ? null : kind;
    setMine({ id: s!.publicId, vote, likes, reaction: next });
    api.reactSong(s!.publicId, next).catch((e: Error) => setError(e.message));
  }

  function play() {
    if (playingThis) return player.toggle(track);
    // This song, then More like this; Autoplay carries on after.
    player.playList([track, ...p!.moreLikeThis.map(publicTrackSong)], 0);
  }

  const family = p!.family;
  const canRemix = p!.remix ? !p!.remix.blocked : s.allowRemix && !s.mine;
  const allowOn = allow?.id === s.publicId ? allow.on : (family?.allowRemix ?? s.allowRemix);
  const openRemix = () => router.push({ pathname: "/listen/remix/[id]", params: { id: s!.publicId } });

  async function setAllowRemix(on: boolean) {
    setStopping(false);
    setError(null);
    setAllow({ id: s!.publicId, on });
    try {
      await api.setAllowRemix(s!.publicId, on);
      if (on) {
        setToast("New remixes are on");
        setTimeout(() => setToast(null), 2500);
      }
    } catch (err) {
      setAllow({ id: s!.publicId, on: !on });
      setError((err as Error).message);
    }
  }

  async function share() {
    const link = api.publicSongLink(s!.publicId);
    await Share.share({ message: `${s!.title} · @${s!.handle} on Reelkar ${link}`, url: link }).catch(() => undefined);
  }

  return (
    <Screen>
      <Header title={s.title} sub={`@${s.handle}`} back />
      <View style={{ alignItems: "center", gap: 10 }}>
        <SongCover song={track} size={240} radius={radius.lg} />
        <Txt variant="cap" style={{ textAlign: "center" }}>
          {[s.genreLabel, s.languageLabel, plays(s.playCount), formatTime(s.durationSec)].join(" · ")}
        </Txt>
        {s.ownVoice ? (
          <View style={[styles.pill, { backgroundColor: colors.surfaceSunken }]}>
            <Txt variant="cap" color="ink">{`Sung in @${s.handle}'s own voice`}</Txt>
          </View>
        ) : null}
        {s.remixOf ? (
          <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: "/s/[id]", params: { id: s.remixOf!.publicId } })}>
            <Txt variant="label" color="tealText">{`A remix of “${s.remixOf.title}” by @${s.remixOf.handle}`}</Txt>
          </Pressable>
        ) : s.remixOfGone ? (
          <Txt variant="cap">A remix of a song that&apos;s no longer public</Txt>
        ) : null}
      </View>

      <Button label={playing ? "Pause" : "Play"} icon={playing ? undefined : "play"} block onPress={play} />

      {s.mine ? (
        <Card flat>
          <Txt variant="label">Your song</Txt>
          <Txt variant="cap">{`${plays(s.playCount)} · ${likes} ${likes === 1 ? "like" : "likes"} · ${s.dislikeCount ?? 0} Not for me (only you see this)`}</Txt>
          {family?.mine ? (
            <>
              <Txt variant="cap">{`${remixWord(family.mine.remixes)} · ${family.mine.published} published`}</Txt>
              <ListRow icon="earn" title={`You earned ${creditAmount(family.mine.earnedHundredths)} credits from remixes`} onPress={() => router.push("/earn")} />
            </>
          ) : null}
          {s.ownVoice ? (
            <Txt variant="cap">Songs in your own voice can&apos;t be remixed.</Txt>
          ) : (
            <ListRow
              title="Allow remixes"
              sub="Others can make a cover or remix. You're always credited."
              right={<Switch accessibilityLabel="Allow remixes" value={allowOn} onValueChange={(on) => (on ? setAllowRemix(true) : setStopping(true))} trackColor={{ true: colors.teal, false: colors.lineStrong }} />}
            />
          )}
          {toast ? <Win text={toast} /> : null}
        </Card>
      ) : (
        <>
          <Row style={{ gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: vote === 1 }}
              accessibilityLabel={`Like, ${likes} ${likes === 1 ? "like" : "likes"}`}
              onPress={() => doVote(1)}
              style={[styles.vote, { borderColor: vote === 1 ? colors.tealText : colors.lineStrong, backgroundColor: vote === 1 ? colors.tealTint : "transparent" }]}>
              <Icon name="heart" size={20} color={vote === 1 ? colors.tealText : colors.ink} />
              <Txt variant="label">{`Like · ${likes}`}</Txt>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: vote === -1 }}
              accessibilityHint="Autoplay won't play it for you again"
              onPress={() => doVote(-1)}
              style={[styles.vote, { borderColor: vote === -1 ? colors.coralText : colors.lineStrong, backgroundColor: vote === -1 ? colors.coralTint : "transparent" }]}>
              <Icon name="thumb-down" size={20} color={vote === -1 ? colors.coralText : colors.ink} />
              <Txt variant="label">Not for me</Txt>
            </Pressable>
          </Row>
          <View style={styles.reactions} accessibilityRole="radiogroup" accessibilityLabel="React">
            {REACTIONS.map((r) => {
              const on = reaction === r.kind;
              const n = s.reactions[r.kind];
              return (
                <Pressable
                  key={r.kind}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={n ? `${r.label}, ${n}` : r.label}
                  onPress={() => doReact(r.kind)}
                  style={[styles.reaction, { borderColor: on ? colors.coral : colors.line, backgroundColor: on ? colors.coralTint : colors.surfaceRaised }]}>
                  <Txt style={{ fontSize: 22, lineHeight: 28 }}>{r.emoji}</Txt>
                  {n ? <Txt variant="cap" color="ink">{String(n)}</Txt> : null}
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <Row style={{ gap: 8 }}>
        {canRemix ? <Button label="Remix" icon="music" kind="secondary" style={{ flex: 1 }} onPress={openRemix} /> : null}
        <Button label="Share" icon="share" kind="secondary" style={{ flex: 1 }} onPress={share} />
      </Row>
      {error ? <Banner kind="error" text={error} /> : null}

      {s.lyrics ? (
        <Card flat>
          <Txt variant="md">Lyrics</Txt>
          <Txt selectable>{s.lyrics.replace(/^\[[^\]]+\]\s*$/gm, "").replace(/\n{3,}/g, "\n\n").trim()}</Txt>
        </Card>
      ) : null}

      {family ? <RemixFamily family={family} publicId={s.publicId} title={s.title} handle={s.handle} canRemix={canRemix} onRemix={openRemix} /> : null}

      <SongRail title="More like this" songs={p!.moreLikeThis} />
      <SongRail title={`By @${s.handle}`} songs={p!.byCreator} />

      <Card flat>
        <Txt variant="cap">Made with AI on Reelkar.</Txt>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/listen/report/[id]", params: { id: s.publicId } })} hitSlop={8} style={styles.report}>
          <Icon name="flag" size={18} color={colors.inkMuted} />
          <Txt variant="label" color="inkMuted">
            Report this song
          </Txt>
        </Pressable>
      </Card>

      <Sheet visible={stopping} onClose={() => setStopping(false)}>
        <Txt variant="md" accessibilityRole="header">
          Stop new remixes?
        </Txt>
        <Txt>{`People won't be able to remix ${s.title} from now on. The ${family?.mine?.remixes ?? 0} remixes already made stay up, with credit to you.`}</Txt>
        <Button label="Stop new remixes" block onPress={() => setAllowRemix(false)} />
        <Button label="Keep remixes on" kind="ghost" block onPress={() => setStopping(false)} />
      </Sheet>
    </Screen>
  );
}


const styles = StyleSheet.create({
  pill: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 },
  vote: { flex: 1, minHeight: 48, borderRadius: radius.pill, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  reactions: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  reaction: { minWidth: 52, minHeight: 48, borderRadius: radius.pill, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 10 },
  report: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
});
