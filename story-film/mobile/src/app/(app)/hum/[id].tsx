import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { ReelLogo } from "@/components/logo";
import { SongPlayerRow, useSongPlayer } from "@/components/song-player";
import { Banner, Button, Card, Header, Hero, ProgressBar, Screen, Status, Txt, Win } from "@/components/ui";
import { api, type Occasion, type Song } from "@/lib/api";
import { currentTake } from "@/lib/hum";
import { giftMessage, sendOnWhatsApp } from "@/lib/gifts";
import { shareSong, songMaking } from "@/lib/songs";

const STEPS = ["Reading your tune", "Adding the band", "Singing it", "Mixing"];
// Songs take about a minute; the bar fills over that and waits near the end.
const EXPECTED_SEC = 75;

// Making and result for "Hum it": waits for the song, plays it, then on to Mix (with the take) or the song itself.
export default function HumResult() {
  // giftUrl / giftTo: this song answers a gift; it already went to giftTo in Reelkar, and gets a link to send too.
  const { id, take, video, giftUrl, giftTo, giftOccasion } = useLocalSearchParams<{ id: string; take?: string; video?: string; giftUrl?: string; giftTo?: string; giftOccasion?: Occasion }>();
  const player = useSongPlayer();
  const [song, setSong] = useState<Song | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const cheered = useRef(false);
  const hasTake = Boolean(take && currentTake.get()?.take.takeId === take);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const s = await api.song(id);
        if (stop) return;
        setSong(s);
        setError(null);
        if (!songMaking(s)) {
          if (s.status === "completed" && !cheered.current) {
            cheered.current = true;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
          }
          return;
        }
      } catch (err) {
        if (!stop) setError((err as Error).message);
      }
      if (!stop) setTimeout(tick, 3000);
    };
    tick();
    const clock = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      stop = true;
      clearInterval(clock);
    };
  }, [id]);

  const making = !song || songMaking(song);
  const progress = Math.min(0.95, elapsed / EXPECTED_SEC);
  const step = STEPS[Math.min(STEPS.length - 1, Math.floor(progress * STEPS.length))];

  return (
    <Screen
      footer={
        song?.status === "completed" ? (
          <>
            {giftUrl && giftTo ? (
              <Button
                label={`Send it back to ${giftTo}`}
                icon="send"
                block
                onPress={() => sendOnWhatsApp(giftMessage(giftTo, giftOccasion ?? "just_because", giftUrl)).catch((e) => setError((e as Error).message))}
              />
            ) : (
              <Button label="Make it a gift" icon="gift" block onPress={() => router.push({ pathname: "/gift/[songId]", params: { songId: id } })} />
            )}
            {hasTake ? (
              <Button label="Mix and save" icon="music" kind="secondary" block onPress={() => router.push({ pathname: "/hum/mix", params: { song: id, take: take! } })} />
            ) : null}
            <Button label={video ? "Make the music video" : "Open in Song Studio"} kind="secondary" icon={video ? "film" : "music"} block onPress={() => router.push(`/songs/${id}`)} />
            <Button label="Make another" kind="ghost" block onPress={() => router.dismissTo("/hum")} />
          </>
        ) : song?.status === "failed" ? (
          <Button label="Record again" icon="mic" block onPress={() => router.dismissTo("/hum")} />
        ) : (
          <Button label="Go to Home" kind="secondary" block onPress={() => router.dismissTo("/home")} />
        )
      }>
      <Header title={song?.title ?? "Your song"} sub="Hum it" back />
      {error && !song ? <Banner kind="error" text={error} /> : null}
      {making ? (
        <Hero>
          <View style={{ alignItems: "center", paddingVertical: 12 }}>
            <ReelLogo size={64} loop />
          </View>
          <Txt variant="lg" color="onBrand">
            Making your song…
          </Txt>
          <ProgressBar onBrand value={progress} />
          <Txt variant="label" color="onBrand">
            {step}
          </Txt>
          <Txt variant="cap" color="onBrandMuted">
            About a minute. You can leave this screen; the song will be in Song Studio.
          </Txt>
        </Hero>
      ) : song?.status === "failed" ? (
        <Banner kind="error" title="That didn't work" text={`${song.error ?? "Something went wrong."} Your credits are back.`} />
      ) : song ? (
        <>
          <Win text={giftTo ? `Your song for ${giftTo} is ready` : "Your song is ready"} icon="music" />
          {giftTo ? <Status kind="ok" text={`${giftTo} gets it in their Reelkar Inbox too.`} /> : null}
          <Card>
            <Txt variant="md">{song.title}</Txt>
            <SongPlayerRow song={song} player={player} />
            <Button label="Share" kind="ghost" icon="share" small onPress={() => shareSong(song).catch((e) => setError((e as Error).message))} />
          </Card>
          {hasTake ? (
            <Status kind="making" text={currentTake.get()?.take.video ? "Mix puts this song under your clip" : "Mix lets you keep your own voice in it, or replace it"} />
          ) : null}
          {error ? <Banner kind="error" text={error} /> : null}
        </>
      ) : null}
    </Screen>
  );
}
