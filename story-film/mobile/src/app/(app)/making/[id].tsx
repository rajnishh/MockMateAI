import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import { Icon } from "@/components/icon";
import { LogoLoader } from "@/components/logo";
import { confirmDelete } from "@/components/reel-grid";
import { Banner, Button, Card, Header, ProgressBar, Screen, Txt } from "@/components/ui";
import { api, ApiError, type Film, type Stage } from "@/lib/api";
import { reviewHref } from "@/lib/music-video";
import { fonts, useTheme } from "@/theme";

// A recipe reel's script follows the recipe's shape.
const stepLabel = (s: { stage: Stage; label: string } | undefined, recipe: boolean) => (s && recipe && s.stage === "script" ? "Hook and script, following the recipe" : s?.label);

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
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<{ text: string; needCredits: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const f = await api.film(id);
        if (!alive) return;
        setFilm(f);
        if (f.status === "completed") return router.replace(`/reel/${f.id}?new=1`);
        if (f.status === "review") return router.replace(reviewHref(f));
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
  // Edits and music videos are made again from their own screens.
  const canRetry = failed && film?.format !== "edit" && !film?.songId;

  // Same request as a new reel (free reel or credits as usual); the new one replaces this one.
  async function retry() {
    setRetrying(true);
    setRetryError(null);
    try {
      const { id: next } = await api.retryFilm(id);
      router.replace(`/making/${next}`);
    } catch (err) {
      setRetryError({ text: (err as Error).message, needCredits: err instanceof ApiError && Boolean(err.needCredits) });
      setRetrying(false);
    }
  }

  return (
    <Screen
      footer={
        failed ? (
          <>
            {canRetry ? <Button label="Try again" icon="refresh" block loading={retrying} onPress={retry} /> : null}
            <Button label={canRetry ? "Make a different reel" : "Try a new reel"} icon={canRetry ? "sparkle" : "refresh"} kind={canRetry ? "secondary" : undefined} block onPress={() => router.replace("/create")} />
            <Button label="Delete this reel" icon="trash" kind="danger" block onPress={() => confirmDelete(id, () => router.replace("/reels"), (message) => Alert.alert("Couldn't delete", message))} />
          </>
        ) : (
          <Button label="Go to Home" kind="secondary" block onPress={() => router.replace("/home")} />
        )
      }>
      <Header title="Making your reel" sub={film?.recipe ? `Recipe by @${film.recipe.handle}` : undefined} back="/home" right={<Txt variant="mono">{`${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`}</Txt>} />
      {error ? <Banner kind="error" text={`${error}. We'll keep trying.`} /> : null}
      {!failed ? <LogoLoader long label={film?.status === "completed" ? "Ready!" : `${stepLabel(STEPS[Math.max(current, 0)], Boolean(film?.recipe)) ?? "Getting started"}…`} /> : null}
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
                  {stepLabel(s, Boolean(film?.recipe))}
                </Txt>
              </View>
            );
          })}
        </Card>
      )}
      {retryError ? (
        <Banner kind="error" text={retryError.text} action={retryError.needCredits ? <Button label="Get credits" small kind="secondary" onPress={() => router.push("/credits")} /> : undefined} />
      ) : null}
      {!failed ? <Banner kind="info" text="You can leave this screen. Your reel keeps being made and shows up in Home." /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
