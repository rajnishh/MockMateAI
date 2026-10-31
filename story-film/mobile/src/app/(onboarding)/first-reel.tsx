import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { Banner, Button, Header, ProgressBar, Screen, Skeleton, Txt, Win } from "@/components/ui";
import { api, type Idea } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useTheme } from "@/theme";

export default function FirstReel() {
  const { prefs, finishOnboarding } = useSession();
  const { colors } = useTheme();
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [picked, setPicked] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .ideas(prefs?.topic ?? "", prefs?.language ?? "hi")
      .then((list) => setIdeas(list.slice(0, 3)))
      .catch(() => setIdeas([{ title: "Your first reel", idea: `A short, friendly introduction to ${prefs?.topic ?? "your topic"} with one useful tip.` }]));
  }, [prefs?.topic, prefs?.language]);

  async function make() {
    if (!ideas) return;
    setBusy(true);
    setError(null);
    try {
      const { id } = await api.createFilm({
        story: `${ideas[picked].title}. ${ideas[picked].idea}`,
        language: prefs?.language ?? "hi",
        durationSec: 30,
        quality: "standard",
        style: "animated",
      });
      await finishOnboarding();
      // Finishing onboarding swaps the route groups; open the reel once Home is mounted.
      setTimeout(() => router.push(`/making/${id}`), 50);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={
        <>
          <Button label="Make my first reel · free" icon="sparkle" block loading={busy} disabled={!ideas} onPress={make} />
          <Button label="Skip, take me to Home" kind="ghost" style={{ alignSelf: "center" }} onPress={finishOnboarding} />
        </>
      }>
      <ProgressBar value={1} />
      <Header title="Let's make your first reel" back />
      <Txt color="inkMuted">Pick an idea. It&apos;s free and takes about 2 minutes.</Txt>
      {error ? <Banner kind="error" text={error} /> : null}
      <View style={{ gap: 12 }} accessibilityRole="radiogroup">
        {ideas
          ? ideas.map((idea, i) => (
              <Pressable
                key={idea.title}
                accessibilityRole="radio"
                accessibilityState={{ checked: picked === i }}
                onPress={() => setPicked(i)}
                style={{
                  borderRadius: 14,
                  padding: 16,
                  gap: 4,
                  borderWidth: picked === i ? 2 : 1,
                  borderColor: picked === i ? colors.tealText : colors.line,
                  backgroundColor: colors.surfaceRaised,
                }}>
                <Txt variant="label">{idea.title}</Txt>
                <Txt variant="cap">{idea.idea}</Txt>
              </Pressable>
            ))
          : [0, 1, 2].map((i) => <Skeleton key={i} height={84} />)}
      </View>
      <Win icon="gift" text="Welcome gift: 20 free credits" />
    </Screen>
  );
}
