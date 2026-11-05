import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Banner, Button, Card, ChipRow, Credits, Field, Header, Screen, Txt } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { duetPart } from "@/lib/duets";
import { signName } from "@/lib/gifts";
import { useSession } from "@/lib/session";
import { GENRES, SONG_LANGUAGES } from "@/lib/songs";
import { useData } from "@/lib/use-data";

// A few styles that suit two voices trading lines; the full list is in Song Studio.
const DUET_GENRES = GENRES.filter((g) => ["bollywood-romantic", "punjabi-pop", "desi-hip-hop", "indie-pop", "sufi", "qawwali", "khaleeji", "pop"].includes(g.value));
const PRICE = 6;

// Start a Jugalbandi (design D1): what it's about, the style, who pays. Then record your part.
export default function NewDuet() {
  const { user, prefs } = useSession();
  const billing = useData(() => api.billing());
  const [topic, setTopic] = useState("");
  const [genre, setGenre] = useState(DUET_GENRES[0]?.value ?? "pop");
  const [language, setLanguage] = useState<string>(prefs?.language ?? "hinglish");
  const [name, setName] = useState(() => signName(user?.name));
  const [ig, setIg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; credits: boolean } | null>(null);
  const balance = billing.data?.balance ?? null;
  const short = balance !== null && balance < PRICE;

  async function start() {
    if (short) return router.push("/credits");
    setBusy(true);
    setError(null);
    try {
      const d = await api.startDuet({ topic: topic.trim(), genre, language, name: name.trim(), ig: ig.trim() });
      duetPart.set({ id: d.id, otherName: "", otherPart: null });
      router.replace(`/duets/${d.id}`);
      router.push("/hum");
    } catch (err) {
      setError({ text: (err as Error).message, credits: err instanceof ApiError && err.needCredits });
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={
        <>
          <Button label={short ? "Get credits" : "Record your part"} icon="mic" block loading={busy} disabled={!short && (topic.trim().length < 3 || !name.trim())} onPress={start} />
          <Txt variant="cap" style={{ textAlign: "center" }}>
            About 30 seconds of humming, singing or just talking
          </Txt>
        </>
      }>
      <Header title="Jugalbandi" sub="Sing with a friend" back right={<Credits count={balance} />} />
      {error ? <Banner kind="error" text={error.text} action={error.credits ? <Button label="Get credits" small onPress={() => router.push("/credits")} /> : undefined} /> : null}
      <Field label="What's it about?" placeholder="Two friends arguing about chai vs coffee" value={topic} onChangeText={setTopic} maxLength={200} multiline />
      <View style={{ gap: 6 }}>
        <Txt variant="cap">Style</Txt>
        <ChipRow options={DUET_GENRES} value={genre} onChange={setGenre} />
      </View>
      <View style={{ gap: 6 }}>
        <Txt variant="cap">Language</Txt>
        <ChipRow options={SONG_LANGUAGES} value={language} onChange={setLanguage} />
      </View>
      <Field label="Your name (your partner sees it)" value={name} onChangeText={setName} maxLength={40} autoCapitalize="words" />
      <Field label="Your Instagram username (for the Collab post)" placeholder="@yourname" value={ig} onChangeText={setIg} maxLength={31} autoCapitalize="none" autoCorrect={false} />
      <Card>
        <Txt variant="label">You pay {PRICE} credits</Txt>
        <Txt variant="cap">Your partner can offer to pay half. If it isn&apos;t made, cancel and they all come back.</Txt>
      </Card>
    </Screen>
  );
}
