import { Image } from "expo-image";
import { router, useNavigation, usePreventRemove } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, useWindowDimensions, View } from "react-native";

import { useReducedMotion } from "@/components/logo";
import { Banner, Button, Card, Header, Hero, ListRow, Row, Screen, Sheet, Skeleton, Txt } from "@/components/ui";
import { api, type Song } from "@/lib/api";
import { capture, CAPTURE_MAX_MB, CAPTURE_MAX_SEC, MOVES_MAX_MB, MOVES_MAX_SEC, pick, shoot, type Captured } from "@/lib/capture";
import { festivalNear, regionNow } from "@/lib/festivals";
import { musicVideos } from "@/lib/music-video";
import { useSession } from "@/lib/session";
import { useData } from "@/lib/use-data";
import { radius, useTheme } from "@/theme";

// A fresh param each hand-off, so a maker that stays mounted still takes the new clip.
const t = () => String(Date.now());
// Prices on the song sheet: Copy my moves is a 15 s clip; a photo music video starts at 30 s.
const MOVES_SEC = 15;
const STAR_SEC = 30;
type SongMaker = "moves" | "star";

const lengthText = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${Math.round(s % 60)} s` : ""}` : `${Math.round(s)} s`);

// "What should we make?" after Film, Snap, Gallery, the chilli long-press or the camera bubble
// (design/v3.0/capture.md 3, quick-create.md 2): a preview, then only the makers that fit, best fit
// first with its reason, every one with its price before you tap.
export default function CaptureChooser() {
  const { prefs } = useSession();
  const navigation = useNavigation();
  const billing = useData(() => api.billing());
  const songs = useData(() => api.songs());
  const [clip, setClip] = useState<Captured | null>(() => capture.get());
  const [sheet, setSheet] = useState<SongMaker | null>(null);
  const festival = festivalNear(new Date(), regionNow(), prefs?.language);
  // Set just before a maker takes the clip, so moving on never asks "Discard this clip?".
  const handedOff = useRef(false);

  // Leaving with a clip that's only here (not a gallery pick) asks first (capture.md 2).
  usePreventRemove(Boolean(clip && clip.source === "camera"), ({ data }) => {
    if (handedOff.current) return navigation.dispatch(data.action);
    Alert.alert(clip?.kind === "photo" ? "Discard this photo?" : "Discard this clip?", undefined, [
      { text: "Keep", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          capture.clear();
          handedOff.current = true;
          navigation.dispatch(data.action);
        },
      },
    ]);
  });

  const ready = (songs.data?.songs ?? []).filter((s) => s.status === "completed").slice(0, 5);
  const prices = useSongPrices(ready, sheet ?? (clip?.kind === "photo" ? "star" : "moves"));

  async function again(fromGallery: boolean, trim = false) {
    const next = fromGallery ? await pick(trim) : await shoot(clip?.kind ?? "video");
    if (next) setClip(next);
  }
  function remove() {
    capture.clear();
    handedOff.current = true;
    setClip(null);
    router.back();
  }
  // Each maker takes the clip from the store, so it's never in a URL.
  function go(to: Parameters<typeof router.replace>[0]) {
    handedOff.current = true;
    setSheet(null);
    router.replace(to);
  }

  if (!clip) {
    return (
      <Screen>
        <Header back title="What should we make?" />
        <Banner kind="info" text="Film something first. Your clip shows up here." />
        <Button label="Film now" icon="video" block onPress={() => again(false)} />
        <Button label="Choose from gallery" kind="secondary" icon="image" block onPress={() => again(true)} />
      </Screen>
    );
  }

  const fromGallery = clip.source === "gallery";
  const sec = clip.seconds ? Math.round(clip.seconds) : null;
  const meta = clip.kind === "photo" ? "Photo" : [sec ? `${sec} s` : null, clip.mb ? `${clip.mb.toFixed(1)} MB` : null].filter(Boolean).join(" · ") || "Your clip";
  const preview = (
    <View style={{ gap: 8 }}>
      <Preview clip={clip} />
      <Row style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
        <Txt variant="cap">{`⁨${meta}⁩`}</Txt>
        <Row style={{ gap: 4, flexWrap: "nowrap" }}>
          <Button label={fromGallery ? "Choose another" : "Retake"} kind="ghost" small onPress={() => again(fromGallery)} />
          <Button label="Remove" kind="ghost" small onPress={remove} />
        </Row>
      </Row>
    </View>
  );
  const songSheet = (
    <Sheet visible={sheet !== null} onClose={() => setSheet(null)}>
      <Txt variant="md">Which song?</Txt>
      {songs.loading ? (
        <Skeleton height={56} />
      ) : ready.length ? (
        ready.map((s) => (
          <ListRow
            key={s.id}
            icon="music"
            title={s.title}
            sub={`${lengthText(s.durationSec)} · ${prices[s.id] === undefined ? "…" : prices[s.id] === null ? "See price" : `${prices[s.id]} credits`}`}
            onPress={() => go({ pathname: "/songs/video/[id]", params: { id: s.id, from: "capture", t: t() } })}
          />
        ))
      ) : (
        <Txt variant="cap">You haven&apos;t made a song yet. Make one first, then come back with this {clip.kind === "photo" ? "photo" : "clip"}.</Txt>
      )}
      <Button label="Make a new song" kind="ghost" icon="plus" onPress={() => (setSheet(null), router.push("/songs/new"))} />
    </Sheet>
  );
  const latest = ready[0] ? prices[ready[0].id] : undefined;
  const songPrice = !songs.data || (ready[0] && latest === undefined) ? null : latest === null ? "See price" : latest !== undefined ? `${latest} credits` : null;

  if (clip.kind === "photo") {
    // A story reel starring a photo is AI animation or Cinematic, never Standard (capture.md 5).
    const quality = billing.data?.premiumAvailable !== false ? "premium" : billing.data?.cinematicAvailable ? "cinematic" : null;
    const perShot = quality === "cinematic" ? (billing.data?.cinematicCreditsPerShot ?? 30) : (billing.data?.premiumCreditsPerShot ?? 12);
    // A 30 s reel: six AI shots.
    const price = billing.data ? `${6 * perShot} credits · 30 s` : "See price";
    const toReel = (idea?: string) => go({ pathname: "/create", params: { kind: "story", from: "capture", t: t(), ...(quality ? { quality } : {}), ...(idea ? { idea } : {}) } });
    const story = billing.loading || quality !== null;
    return (
      <Screen>
        <Header back title="What should we make?" sub="Your photo" />
        {preview}
        {story ? (
          <Hero>
            <View style={{ gap: 6 }}>
              <Txt variant="cap" color="onBrand">Best fit</Txt>
              <Txt variant="md" color="onBrand">Star in a story reel</Txt>
              <Txt color="onBrand">AI animates your photo into a story reel. Tell it the story next.</Txt>
              <Txt variant="cap" color="onBrand">{price}</Txt>
            </View>
            <Button label="Make my reel" icon="sparkle" block onPress={() => toReel()} />
          </Hero>
        ) : null}
        <Card>
          <Txt variant="label">{story ? "Or make" : "Make"}</Txt>
          {festival && story ? <ListRow icon="sparkle" title={`Make it a ${festival.name} reel`} sub={`Starring your photo · ${price}`} onPress={() => toReel(festival.idea)} /> : null}
          <ListRow icon="music" title="Star in a music video" sub={`You sing one of your songs, lips in sync · ${songPrice ?? "…"}`} onPress={() => setSheet("star")} />
        </Card>
        <Txt variant="cap">You&apos;ll confirm this is you, or someone who agreed. Famous people aren&apos;t allowed.</Txt>
        {songSheet}
      </Screen>
    );
  }

  const tooLong = Boolean(clip.seconds && clip.seconds > CAPTURE_MAX_SEC + 0.5);
  const tooBig = Boolean(clip.mb && clip.mb > CAPTURE_MAX_MB);
  const tooShort = Boolean(clip.seconds && clip.seconds < 2);
  const free = billing.data?.freeLeft ?? null;
  const editPrice = billing.data ? (free === null ? `Free · ${billing.data.freeVideosPerWeek} a week` : free > 0 ? `Free · ${free} left this week` : "1 credit") : "See price";
  const editFits = !clip.seconds || clip.seconds >= 3;
  // Talking clips get captions and zooms; very short ones still work, but say so.
  const editReason = sec && sec < 5 ? `Your clip is ${sec} s: short and punchy, we'll add a big caption and a sound` : `Your clip${sec ? ` is ${sec} s` : ""}: we'll add captions, zooms, effects and sounds`;
  const movesFits = (!clip.seconds || (clip.seconds >= 3 && clip.seconds <= MOVES_MAX_SEC + 0.5)) && (!clip.mb || clip.mb <= MOVES_MAX_MB);
  const toEdit = () => go({ pathname: "/create", params: { kind: "edit", from: "capture", t: t() } });
  const toHum = () => go({ pathname: "/hum", params: { from: "capture" } });

  return (
    <Screen>
      <Header back title="What should we make?" sub={fromGallery ? "From your gallery" : "Your clip"} />
      {preview}
      {tooLong || tooBig || tooShort ? (
        <Banner
          kind="warn"
          text={
            tooShort
              ? "This video is under 2 seconds. Film a little longer."
              : tooLong
                ? `This video is ${lengthText(clip.seconds!)}. Reels can be up to ${CAPTURE_MAX_SEC} seconds.`
                : `This video is ${clip.mb!.toFixed(0)} MB. Videos can be up to ${CAPTURE_MAX_MB} MB. Trim it, or film at 1080p.`
          }
          action={
            tooShort ? (
              <Button label="Film again" small kind="secondary" onPress={() => again(false)} />
            ) : (
              <Button label="Trim it" small kind="secondary" onPress={() => again(fromGallery, true)} />
            )
          }
        />
      ) : (
        <>
          {editFits ? (
            <Hero>
              <View style={{ gap: 6 }}>
                <Txt variant="cap" color="onBrand">Best fit</Txt>
                <Txt variant="md" color="onBrand">Edit my video</Txt>
                <Txt color="onBrand">{editReason}</Txt>
                <Txt variant="cap" color="onBrand">{editPrice}</Txt>
              </View>
              <Button label="Add effects" icon="sparkle" block onPress={toEdit} />
            </Hero>
          ) : null}
          <Card>
            <Txt variant="label">{editFits ? "Or make" : "Make"}</Txt>
            <ListRow icon="music" title="Put a song under it" sub="Hum it hears your clip and makes a song for it · 1 credit" onPress={toHum} />
            {movesFits ? (
              <ListRow icon="film" title="Copy my moves" sub={`A music video where the star dances your moves · ${songPrice ?? "…"}`} onPress={() => setSheet("moves")} />
            ) : null}
          </Card>
          {movesFits ? <Txt variant="cap">If someone else is in it, you&apos;ll confirm they agreed before anything is made.</Txt> : null}
        </>
      )}
      {songSheet}
    </Screen>
  );
}

// The clip plays muted on a loop (or waits for a tap with Reduce Motion on); a photo shows as it is.
function Preview({ clip }: { clip: Captured }) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const h = Math.min(Math.round(height * 0.4), 360);
  const player = useVideoPlayer(clip.kind === "video" ? clip.uri : null, (p) => {
    p.muted = true;
    p.loop = true;
    if (!reduced) p.play();
  });
  const label = clip.kind === "photo" ? "Your photo" : `Your video${clip.seconds ? `, ${Math.round(clip.seconds)} seconds` : ""}`;
  return (
    <View accessible accessibilityLabel={label} style={[styles.preview, { height: h, backgroundColor: colors.surfaceSunken }]}>
      {clip.kind === "photo" ? (
        <Image source={{ uri: clip.uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
      ) : (
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={reduced} />
      )}
    </View>
  );
}

// Credits for a music video of each finished song: Copy my moves (kind full, 15 s) or a photo that
// sings (kind performance, 30 s). null when the price couldn't be fetched; never a guess.
function useSongPrices(ready: Song[], maker: SongMaker) {
  // Keyed by maker and song, so switching between them never shows the other's price.
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const ids = ready.map((s) => s.id).join(",");
  useEffect(() => {
    let live = true;
    const kind = maker === "moves" ? "full" : "performance";
    for (const s of ready) {
      const seconds = Math.min(maker === "moves" ? MOVES_SEC : STAR_SEC, s.durationSec);
      const key = `${maker}:${s.id}`;
      musicVideos.options(s.id, seconds).then(
        (o) => live && setPrices((p) => ({ ...p, [key]: o.kinds.find((k) => k.kind === kind && k.available)?.credits ?? null })),
        () => live && setPrices((p) => ({ ...p, [key]: null })),
      );
    }
    return () => {
      live = false;
    };
    // ready is rebuilt every render; its ids are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, maker]);
  return Object.fromEntries(ready.map((s) => [s.id, prices[`${maker}:${s.id}`]])) as Record<string, number | null | undefined>;
}

const styles = StyleSheet.create({
  preview: { borderRadius: radius.lg, overflow: "hidden", width: "100%" },
});
