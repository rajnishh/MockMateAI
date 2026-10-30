import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Icon } from "@/components/icon";
import { Banner, Button, Card, Header, ProgressBar, Screen, Txt } from "@/components/ui";
import { api, type Film, type Stage } from "@/lib/api";
import { fonts, useTheme } from "@/theme";

const STEPS: { stage: Stage; label: string }[] = [
  { stage: "script", label: "Hook and script" },
  { stage: "keyframes", label: "Scenes" },
  { stage: "clips", label: "Animation" },
  { stage: "audio", label: "Voice and music" },
  { stage: "assemble", label: "Captions and final cut" },
];

export default function Making() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const [film, setFilm] = useState<Film | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const f = await api.film(id);
        if (!alive) return;
        setFilm(f);
        if (f.status === "completed") return router.replace(`/reel/${f.id}`);
        if (f.status === "review") return router.replace(`/edit/${f.id}`);
        if (f.status === "failed") return;
      } catch (err) {
        if (alive) setError((err as Error).message);
      }
      timer = setTimeout(poll, 3000);
    };
    poll();
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [id]);

  const current = film?.stage ? STEPS.findIndex((s) => s.stage === film.stage) : 0;
  const failed = film?.status === "failed";

  return (
    <Screen
      footer={
        failed ? (
          <Button label="Try a new reel" icon="refresh" block onPress={() => router.replace("/create")} />
        ) : (
          <Button label="Go to Home" kind="secondary" block onPress={() => router.replace("/home")} />
        )
      }>
      <Header title="Making your reel" back="/home" right={<Txt variant="mono">{`${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`}</Txt>} />
      {error ? <Banner kind="error" text={`${error}. We'll keep trying.`} /> : null}
      {failed ? (
        <Banner kind="error" title="This reel couldn't be made" text={`${film?.error ?? "Something went wrong."} ${film?.credits ? "Your credits are back." : "It didn't use your free reels."}`} />
      ) : (
        <Card>
          <ProgressBar value={(Math.max(current, 0) + 0.5) / STEPS.length} />
          {STEPS.map((s, i) => {
            const state = i < current ? "done" : i === current ? "now" : "next";
            return (
              <View key={s.stage} style={styles.step}>
                <View
                  style={[
                    styles.dot,
                    { borderColor: state === "next" ? colors.lineStrong : colors.tealText, borderWidth: state === "now" ? 3 : 2 },
                    state === "done" && { backgroundColor: colors.tealText },
                  ]}>
                  {state === "done" ? <Icon name="check" size={16} color={colors.surfaceRaised} /> : <Txt variant="mono" color={state === "now" ? "tealText" : "inkMuted"}>{String(i + 1)}</Txt>}
                </View>
                <Txt variant="body" color={state === "next" ? "inkMuted" : "ink"} style={state === "now" ? { fontFamily: fonts.bold } : undefined}>
                  {s.label}
                </Txt>
              </View>
            );
          })}
        </Card>
      )}
      {!failed ? <Banner kind="info" text="You can leave this screen. Your reel keeps being made and shows up in Home." /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
