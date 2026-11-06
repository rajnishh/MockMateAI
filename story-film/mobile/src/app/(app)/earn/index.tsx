import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Image, View } from "react-native";

import { HowEarning, nodeSong } from "@/components/remix-family";
import { ReelThumb } from "@/components/reel-thumb";
import { SongCover } from "@/components/song-cover";
import { Banner, Button, Card, ChipRow, Empty, Header, Hero, ListRow, Screen, Sheet, Skeleton, Status, Txt } from "@/components/ui";
import { api, type EarningSource } from "@/lib/api";
import { creditAmount, earnPercent, plusAmount, remixWord } from "@/lib/remixes";
import { useData } from "@/lib/use-data";

type Chip = EarningSource | "all";

// Earnings (design/community/remix-spec.md X13, shared with reel recipes): what your songs and
// recipes earned, by song or recipe, highest first.
export default function Earnings() {
  const [chip, setChip] = useState<Chip>("all");
  const [how, setHow] = useState(false);
  const earn = useData(() => api.earnings(chip));
  const { reload } = earn;
  useEffect(() => {
    reload();
  }, [chip, reload]);
  const e = earn.data;

  return (
    <Screen>
      <Header title="Earnings" back />
      {earn.error ? <Banner kind="error" text="Couldn't load your earnings." action={<Button label="Try again" small kind="secondary" onPress={reload} />} /> : null}
      {!e ? (
        earn.error ? null : (
          <>
            <Skeleton height={130} />
            <Skeleton height={180} />
          </>
        )
      ) : (
        <>
          <Hero>
            <Txt variant="over" color="onBrandMuted">
              You&apos;ve earned
            </Txt>
            <Txt variant="xl" color="onBrand">{`${creditAmount(e.totalHundredths)} credits`}</Txt>
            <Txt variant="cap" color="onBrandMuted">{`${e.credited} added to your balance · ${creditAmount(e.onTheWay)} on the way`}</Txt>
          </Hero>
          <ChipRow<Chip>
            options={[
              { value: "all", label: "All" },
              { value: "remix", label: "Remixes" },
              { value: "recipe", label: "Recipes" },
            ]}
            value={chip}
            onChange={setChip}
          />
          {e.bySubject.length ? (
            <Card>
              {e.bySubject.map((x) => (
                <View key={`${x.source}:${x.subjectRef}`} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  {x.source === "recipe" ? (
                    api.recipePosterUrl(x.coverUrl) ? <Image source={{ uri: api.recipePosterUrl(x.coverUrl)! }} style={{ width: 40, aspectRatio: 9 / 16, borderRadius: 8 }} accessibilityIgnoresInvertColors /> : <ReelThumb width={40} />
                  ) : (
                    <SongCover song={nodeSong({ publicId: x.subjectRef, title: x.title, handle: null, coverUrl: x.coverUrl, kind: null, depth: 0, playCount: 0, remixCount: 0, gone: false })} size={44} radius={10} />
                  )}
                  <View style={{ flex: 1 }}>
                    {x.source === "recipe" && x.state && x.state !== "public" ? <Status kind={x.state === "taken_down" ? "error" : "warn"} text={x.state === "taken_down" ? "Removed" : "Stopped"} /> : null}
                    <ListRow
                      title={x.title ?? (x.source === "recipe" ? "A removed recipe" : "A removed song")}
                      sub={x.source === "remix" ? remixWord(x.count) : `${x.count} ${x.count === 1 ? "use" : "uses"} · ${x.freeUses ?? 0} free`}
                      right={<Txt variant="label">{plusAmount(x.hundredths)}</Txt>}
                      onPress={() => router.push({ pathname: "/earn/[ref]", params: { ref: x.subjectRef } })}
                    />
                  </View>
                </View>
              ))}
            </Card>
          ) : (
            <Empty
              title="Nothing earned yet"
              text={chip === "recipe" ? "Share a finished reel as a recipe. You earn credits when people make reels with it." : "When people remix your public songs or use your recipes, it shows here."}
              action={
                chip === "recipe" ? (
                  <Button label="Open my reels" icon="film" kind="secondary" onPress={() => router.push("/reels")} />
                ) : (
                  <Button label="Share a song on Listen" icon="music" kind="secondary" onPress={() => router.push("/songs")} />
                )
              }
            />
          )}
          <Card onPress={() => setHow(true)}>
            <ListRow icon="earn" title="How earning works" sub={`${earnPercent(e.rateBp)} of the paid credits each remix or recipe reel spends`} onPress={() => setHow(true)} />
          </Card>
          <Txt variant="cap">Earned credits work like any credits. They can&apos;t be cashed out yet.</Txt>
        </>
      )}
      <Sheet visible={how} onClose={() => setHow(false)}>
        <HowEarning rate={earnPercent(e?.rateBp ?? 1000)} />
        <Button label="Got it" block onPress={() => setHow(false)} />
      </Sheet>
    </Screen>
  );
}
