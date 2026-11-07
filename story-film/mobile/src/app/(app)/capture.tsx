import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Banner, Button, Card, Header, Hero, ListRow, Screen, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { capture, CAPTURE_MAX_MB, CAPTURE_MAX_SEC, filmNow } from "@/lib/capture";
import { useData } from "@/lib/use-data";

// "What should we make?" after the camera bubble or a chilli long-press (design/v3.0/quick-create.md 2,
// "Snap & suggest"): the clip's best fit first with the reason, every option with its price.
export default function CaptureChooser() {
  const billing = useData(() => api.billing());
  const [clip] = useState(() => capture.get());

  if (!clip) {
    return (
      <Screen>
        <Header back title="What should we make?" />
        <Banner kind="info" text="Film something first. Your clip shows up here." />
        <Button label="Film now" icon="camera" block onPress={filmNow} />
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

  // Each maker takes the clip from the store, so it's never in a URL.
  const toEdit = () => router.replace({ pathname: "/create", params: { kind: "edit", from: "capture", t: String(Date.now()) } });
  const toHum = () => router.replace({ pathname: "/hum", params: { from: "capture" } });

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
          </Card>
        </>
      )}
      <Button label="Film again" kind="secondary" icon="camera" block onPress={filmNow} />
    </Screen>
  );
}
