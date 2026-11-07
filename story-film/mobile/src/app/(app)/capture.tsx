import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Banner, Button, Card, Header, Hero, ListRow, Screen, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { capture, CAPTURE_MAX_MB, CAPTURE_MAX_SEC, filmNow, snapPhoto } from "@/lib/capture";
import { festivalNear, regionNow } from "@/lib/festivals";
import { useSession } from "@/lib/session";
import { useData } from "@/lib/use-data";

// Music video "Copy my moves" wants a short clip of the whole body dancing.
const MOVES_MAX_SEC = 15;
// A fresh param each hand-off, so a maker that stays mounted still takes the new clip.
const t = () => String(Date.now());

// "What should we make?" after the camera bubble or a chilli long-press (design/v3.0/quick-create.md 2,
// "Snap & suggest"): the best fit first with the reason, every option with its price.
export default function CaptureChooser() {
  const { prefs } = useSession();
  const billing = useData(() => api.billing());
  const [clip] = useState(() => capture.get());
  const [pickSong, setPickSong] = useState(false);
  const songs = useData(() => api.songs());
  const festival = festivalNear(new Date(), regionNow(), prefs?.language);

  if (!clip) {
    return (
      <Screen>
        <Header back title="What should we make?" />
        <Banner kind="info" text="Film something first. Your clip shows up here." />
        <Button label="Film now" icon="camera" block onPress={filmNow} />
      </Screen>
    );
  }

  if (clip.kind === "photo") {
    const perShot = billing.data?.premiumCreditsPerShot ?? 12;
    // A 30 s reel: six AI shots.
    const price = billing.data ? `${6 * perShot} credits for 30 s` : "See price";
    const toReel = (idea?: string) => router.replace({ pathname: "/create", params: { kind: "story", from: "capture", t: t(), ...(idea ? { idea } : {}) } });
    return (
      <Screen>
        <Header back title="What should we make?" sub="Your photo" />
        <Hero>
          <View style={{ gap: 6 }}>
            <Txt variant="cap" color="onBrand">Best fit</Txt>
            <Txt variant="md" color="onBrand">A reel starring you</Txt>
            <Txt color="onBrand">AI animates your photo into a story reel. Tell it the story next.</Txt>
            <Txt variant="cap" color="onBrand">{price}</Txt>
          </View>
          <Button label="Make my reel" icon="sparkle" block onPress={() => toReel()} />
        </Hero>
        {festival ? (
          <Card>
            <ListRow icon="sparkle" title={`Make it a ${festival.name} reel`} sub={`Starring your photo · ${price}`} onPress={() => toReel(festival.idea)} />
          </Card>
        ) : null}
        <Button label="Take another" kind="secondary" icon="camera" block onPress={snapPhoto} />
      </Screen>
    );
  }

  const sec = clip.seconds ? Math.round(clip.seconds) : null;
  const tooLong = Boolean(clip.seconds && clip.seconds > CAPTURE_MAX_SEC + 0.5);
  const tooBig = Boolean(clip.mb && clip.mb > CAPTURE_MAX_MB);
  const free = billing.data?.freeLeft ?? null;
  const editPrice = billing.data ? (free === null ? `Free · ${billing.data.freeVideosPerWeek} a week` : free > 0 ? `Free · ${free} left this week` : "1 credit") : "See price";
  // Talking clips get captions and zooms; very short ones still work, but say so.
  const editReason = sec && sec < 5 ? `Your clip is ${sec} s: short and punchy, we'll add a big caption and a sound` : `Your clip${sec ? ` is ${sec} s` : ""}: we'll add captions, zooms, effects and sounds`;
  const meta = [sec ? `${sec} s` : null, clip.mb ? `${clip.mb.toFixed(1)} MB` : null].filter(Boolean).join(" · ");
  const shortEnough = !clip.seconds || clip.seconds <= MOVES_MAX_SEC + 0.5;
  const ready = songs.data?.songs.filter((s) => s.status === "completed").slice(0, 5) ?? [];

  // Each maker takes the clip from the store, so it's never in a URL.
  const toEdit = () => router.replace({ pathname: "/create", params: { kind: "edit", from: "capture", t: t() } });
  const toHum = () => router.replace({ pathname: "/hum", params: { from: "capture" } });
  const toMoves = (songId: string) => router.replace({ pathname: "/songs/video/[id]", params: { id: songId, from: "capture", t: t() } });

  return (
    <Screen>
      <Header back title="What should we make?" sub={meta || "Your clip"} />
      {tooLong || tooBig ? (
        <Banner
          kind="warn"
          text={tooLong ? `This video is ${sec} s. Reels can be up to ${CAPTURE_MAX_SEC} seconds.` : `This video is ${clip.mb!.toFixed(0)} MB. Videos can be up to ${CAPTURE_MAX_MB} MB.`}
          action={<Button label="Film again" small kind="secondary" onPress={filmNow} />}
        />
      ) : (
        <>
          <Hero>
            <View style={{ gap: 6 }}>
              <Txt variant="cap" color="onBrand">Best fit</Txt>
              <Txt variant="md" color="onBrand">Edit my video</Txt>
              <Txt color="onBrand">{editReason}</Txt>
              <Txt variant="cap" color="onBrand">{editPrice}</Txt>
            </View>
            <Button label="Add effects" icon="sparkle" block onPress={toEdit} />
          </Hero>
          <Card>
            <Txt variant="label">Or make</Txt>
            <ListRow icon="music" title="Put a song under it" sub="Hum it hears your clip and makes a song for it · free to try" onPress={toHum} />
            {shortEnough ? (
              <ListRow
                icon="film"
                title="Copy my moves"
                sub="A music video where the star dances your moves · price on the next screen"
                onPress={() => setPickSong((v) => !v)}
              />
            ) : null}
            {pickSong ? (
              songs.loading ? (
                <Txt variant="cap">Loading your songs…</Txt>
              ) : ready.length ? (
                <>
                  <Txt variant="cap">Which song?</Txt>
                  {ready.map((s) => (
                    <ListRow key={s.id} title={s.title} sub={`${s.genre} · ${Math.round(s.durationSec)} s`} onPress={() => toMoves(s.id)} />
                  ))}
                </>
              ) : (
                <Banner kind="info" text="Make a song first, then copy your moves into its music video." action={<Button label="Make a song" small kind="secondary" onPress={() => router.push("/songs/new")} />} />
              )
            ) : null}
          </Card>
        </>
      )}
      <Button label="Film again" kind="secondary" icon="camera" block onPress={filmNow} />
    </Screen>
  );
}
