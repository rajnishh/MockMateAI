import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { Banner, Button, Card, ChipRow, Credits, Field, Header, Row, Screen, Skeleton, Txt } from "@/components/ui";
import { api, ApiError, type SongOptions, type SongVocal } from "@/lib/api";
import { cleanPrompt, currentTake, hum, KIND_LABEL, MAKE_OPTIONS, type HeardKind, type MakeKind, type Take } from "@/lib/hum";
import { formatTime, genreLabel, GENRES, SONG_LANGUAGES, VOCALS } from "@/lib/songs";
import { useData } from "@/lib/use-data";
import { useTheme } from "@/theme";

type Heard = Omit<Take, "takeId" | "durationSec" | "video"> & Partial<Pick<Take, "takeId" | "durationSec" | "video">>;
type Length = "30" | "60" | "120" | "180" | "240";
type Writing = "lyrics" | "polish" | "style" | null;

// "Here's what I heard": what Reelkar understood and what it will make, all changeable, before any credits are spent.
// Opened after a recording, or with ?prompt= from Siri, Shortcuts, another app or reelkar://create?prompt=….
export default function HumConfirm() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ prompt?: string }>();
  const prompt = cleanPrompt(params.prompt);
  const billing = useData(() => api.billing());
  const [heard, setHeard] = useState<Heard | null>(() => (prompt ? null : (currentTake.get()?.take ?? null)));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kind, setKind] = useState<HeardKind>(heard?.kind ?? "speech");
  const [text, setText] = useState(heard?.kind === "sing" ? heard.plan.lyrics || heard.transcript : (heard?.transcript ?? prompt));
  const [make, setMake] = useState<MakeKind>(heard?.plan.make ?? "song");
  const [topic, setTopic] = useState(heard?.plan.topic ?? "");
  const [title, setTitle] = useState(heard?.plan.title ?? "");
  const [genre, setGenre] = useState(heard?.plan.genre ?? "bollywood-romantic");
  const [language, setLanguage] = useState(heard?.plan.language ?? "hi");
  const [length, setLength] = useState<Length>(lengthFor(heard?.plan.durationSec));
  // Lyrics for a hum or a request (a song's sung lines are `text`), the style text and the voice.
  const [words, setWords] = useState("");
  const [style, setStyle] = useState("");
  const [vocal, setVocal] = useState<SongVocal>("auto");
  const [writing, setWriting] = useState<Writing>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; credits: boolean } | null>(null);

  // A prompt handed over from outside goes through the same understanding as a spoken request.
  useEffect(() => {
    if (!prompt) return;
    hum
      .understand(prompt)
      .then((h) => {
        setHeard(h);
        setText(prompt);
        setMake(h.plan.make);
        setTopic(h.plan.topic || prompt);
        setTitle(h.plan.title);
        setGenre(h.plan.genre);
        setLanguage(h.plan.language);
        setLength(lengthFor(h.plan.durationSec));
      })
      .catch((err) => setLoadError((err as Error).message));
  }, [prompt]);

  const takeId = heard?.takeId;
  const tune = kind !== "speech";
  const reel = !tune && make === "reel";
  const cost = !heard ? 0 : tune ? heard.credits.tune : reel ? 0 : heard.credits.song;
  const balance = billing.data?.balance ?? null;
  const short = balance !== null && cost > balance;
  const blocked = busy || !heard || (tune ? !title.trim() || !takeId : topic.trim().length < 3 && text.trim().length < 3) || heard.songsAvailable === false && !reel;

  // The free AI helpers from Song Studio: write or polish lyrics, and enhance the style.
  const tuneSec: SongOptions["durationSec"] = (heard?.durationSec ?? 30) <= 45 ? 30 : 60;
  const songOptions = (): SongOptions => ({
    topic: (topic.trim() || (kind === "speech" ? text.trim() : "")).slice(0, 300),
    genre,
    mood: heard?.plan.mood ?? "",
    language,
    durationSec: tune ? tuneSec : (Number(length) as SongOptions["durationSec"]),
    kidSafe: false,
  });

  async function help(what: Exclude<Writing, null>) {
    setWriting(what);
    setError(null);
    try {
      if (what === "style") setStyle(await api.songStyle({ ...songOptions(), idea: style.trim() || topic.trim() || text.trim().slice(0, 300), vocal }));
      else {
        const draft = what === "polish" ? (kind === "sing" ? text : words).trim() : undefined;
        const out = await api.songLyrics({ ...songOptions(), ...(draft ? { draft } : {}), duet: vocal === "duet" });
        if (kind === "sing") setText(out.lyrics);
        else setWords(out.lyrics);
        if (!title.trim() && out.title) setTitle(out.title.slice(0, 80));
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (err) {
      setError({ text: (err as Error).message, credits: false });
    } finally {
      setWriting(null);
    }
  }

  async function makeIt() {
    if (!heard) return;
    if (short) return router.push("/credits");
    setBusy(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    try {
      if (tune && takeId) {
        const { id } = await hum.tuneSong(takeId, {
          kind: kind as "hum" | "sing",
          title: title.trim(),
          genre,
          mood: heard.plan.mood,
          language,
          topic: kind === "hum" ? topic.trim() : "",
          lyrics: kind === "sing" ? text.trim() : words.trim(),
          vocal,
          ...(style.trim() ? { style: style.trim() } : {}),
        });
        router.replace({ pathname: "/hum/[id]", params: { id, take: takeId } });
      } else if (reel) {
        const sec = Math.min(60, Number(length));
        const { id } = await api.createFilm({ story: (topic.trim() || text.trim()).slice(0, 500), language: language === "hinglish" ? "hi" : language, durationSec: sec, quality: "standard", style: "animated" });
        router.replace(`/making/${id}`);
      } else {
        const durationSec = Number(length) as SongOptions["durationSec"];
        const options: SongOptions = { topic: (topic.trim() || text.trim()).slice(0, 300), genre, mood: heard.plan.mood, language, durationSec, kidSafe: false };
        const own = words.trim() || heard.plan.lyrics.trim();
        const lyrics = own.length >= 20 ? { title: title.trim() || "My song", lyrics: own } : await api.songLyrics({ ...options, duet: vocal === "duet" });
        const { id } = await api.createSong({
          ...options,
          title: title.trim() || lyrics.title,
          lyrics: lyrics.lyrics,
          vocal,
          ...(style.trim() ? { style: style.trim() } : {}),
          takes: 1,
          model: durationSec === 30 ? "lyria" : "ace-step",
        });
        router.replace({ pathname: "/hum/[id]", params: { id, ...(takeId ? { take: takeId } : {}), ...(make === "music_video" ? { video: "1" } : {}) } });
      }
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      setError({ text: (err as Error).message, credits: err instanceof ApiError && err.needCredits });
      setBusy(false);
    }
  }

  // A hum or a song needs the recording; a typed or Siri request can only be a request.
  const kinds = (takeId ? (["hum", "sing", "speech"] as const) : (["speech"] as const)).map((k) => ({ value: k, label: KIND_LABEL[k] }));
  const label = !heard ? "Make it" : short ? `You need ${cost} credits` : cost > 0 ? `Make it · ${cost} credits` : "Make it";

  return (
    <Screen
      footer={
        <>
          <Button label={short ? "Get credits" : label} icon="sparkle" block disabled={blocked && !short} loading={busy} onPress={makeIt} />
          <Txt variant="cap" style={{ textAlign: "center" }}>
            {reel ? "Uses a free reel this week, else 1 credit · about 2 minutes" : "About a minute · you can leave this screen"}
          </Txt>
          {takeId ? <Button label="Record again" kind="ghost" block onPress={() => router.back()} /> : null}
        </>
      }>
      <Header title="Here's what I heard" back right={<Credits count={balance} />} />
      {prompt ? <Banner kind="info" text="Sent from Siri or another app. Check it, then tap Make it." /> : null}
      {loadError ? <Banner kind="error" text={loadError} action={<Button label="Back" small onPress={() => router.back()} />} /> : null}
      {error ? (
        <Banner kind="error" title={error.credits ? `You need ${cost} credits` : undefined} text={error.text} action={error.credits ? <Button label="Get credits" small onPress={() => router.push("/credits")} /> : undefined} />
      ) : null}
      {heard?.songsAvailable === false && !reel ? <Banner kind="warn" text="Songs aren't set up on this server yet. You can still make a reel." /> : null}

      {!heard ? (
        <>
          <Skeleton height={120} />
          <Skeleton height={200} />
        </>
      ) : (
        <Card>
          <Txt variant="over">I heard</Txt>
          <ChipRow<HeardKind> options={kinds} value={kind} onChange={setKind} />
          {takeId ? <Txt variant="cap">Not right? Tap the one you meant.</Txt> : null}

          {kind === "hum" ? (
            <View style={{ gap: 4 }}>
              <Txt variant="label">Your tune</Txt>
              <Txt variant="cap">{`No words, just your tune${heard.durationSec ? ` · ${formatTime(heard.durationSec)}` : ""}`}</Txt>
            </View>
          ) : (
            <Field
              label={kind === "sing" ? "Your lines (you can fix them)" : "You said (you can fix it)"}
              value={text}
              onChangeText={setText}
              multiline
              style={{ minHeight: 80 }}
              placeholder={kind === "sing" ? "The lines you sang" : "What should Reelkar make?"}
            />
          )}
          {kind === "sing" ? (
            <Button label={writing === "polish" ? "Writing…" : "✨ Polish my lines"} kind="secondary" small disabled={writing !== null || text.trim().length < 10} onPress={() => help("polish")} />
          ) : null}

          <View style={{ height: 1, backgroundColor: colors.line }} />
          <Txt variant="over">I&apos;ll make</Txt>
          {tune ? (
            <>
              <Txt variant="md">{`A ${genreLabel(genre)} song on your tune`}</Txt>
              {kind === "hum" ? (
                <Field label="What's it about? (optional)" value={topic} onChangeText={setTopic} placeholder="Leave empty for a song with no words" />
              ) : null}
              {kind === "hum" && !words.trim() ? <Txt variant="cap">{topic.trim() ? "AI writes words to fit your tune when you tap Make it, or write them now to check them." : "No words: the band plays your tune."}</Txt> : null}
              {kind === "hum" && topic.trim().length >= 3 ? (
                <Button label={writing === "lyrics" ? "Writing…" : words.trim() ? "✨ Write them again" : "✨ Write the words now"} kind="secondary" small disabled={writing !== null} onPress={() => help("lyrics")} />
              ) : null}
              {kind === "hum" && words.trim() ? <Field label="Words for your tune" value={words} onChangeText={setWords} multiline style={{ minHeight: 120 }} /> : null}
            </>
          ) : (
            <>
              <ChipRow<MakeKind> options={MAKE_OPTIONS} value={make} onChange={setMake} />
              <Field label="About" value={topic} onChangeText={setTopic} placeholder="A Punjabi wedding song about my sister" />
              <Txt variant="cap">Length</Txt>
              <ChipRow<Length>
                options={[
                  { value: "30", label: "30 s" },
                  { value: "60", label: "1 min" },
                  ...(reel
                    ? []
                    : [
                        { value: "120" as const, label: "2 min" },
                        { value: "180" as const, label: "3 min" },
                        { value: "240" as const, label: "4 min" },
                      ]),
                ]}
                value={reel && Number(length) > 60 ? "60" : length}
                onChange={setLength}
              />
              {!reel ? (
                <>
                  <Field label="Lyrics (optional)" value={words} onChangeText={setWords} multiline style={{ minHeight: 120 }} placeholder="Leave empty and AI writes them when you tap Make it" />
                  <Row>
                    <Button label={writing === "lyrics" ? "Writing…" : "✨ Write lyrics"} kind="secondary" small disabled={writing !== null || (topic.trim().length < 3 && text.trim().length < 3)} onPress={() => help("lyrics")} style={{ flex: 1 }} />
                    <Button label={writing === "polish" ? "Writing…" : "✨ Enhance"} kind="secondary" small disabled={writing !== null || words.trim().length < 10} onPress={() => help("polish")} style={{ flex: 1 }} />
                  </Row>
                </>
              ) : null}
            </>
          )}
          {!reel ? (
            <>
              <Txt variant="cap">Style</Txt>
              <ChipRow options={GENRES} value={genre} onChange={setGenre} />
              <Field label="Your own style (optional)" value={style} onChangeText={(t) => setStyle(t.slice(0, 500))} multiline placeholder="Slow and sad, soft piano, rain sounds" />
              <Button label={writing === "style" ? "Writing…" : "✨ Enhance style"} kind="secondary" small disabled={writing !== null} onPress={() => help("style")} />
              <Txt variant="cap">Voice</Txt>
              <ChipRow<SongVocal> options={VOCALS} value={vocal} onChange={setVocal} />
              {tune && vocal === "auto" ? <Txt variant="cap">One singer, like your recording.</Txt> : null}
            </>
          ) : null}
          <Txt variant="cap">Language</Txt>
          <ChipRow options={SONG_LANGUAGES} value={language} onChange={setLanguage} />
          {!reel ? <Field label="Title" value={title} onChangeText={(t) => setTitle(t.slice(0, 80))} placeholder="A short title" /> : null}
          {make === "music_video" && !tune ? <Txt variant="cap">Reelkar makes the song first; then pick the music video look on the song.</Txt> : null}
          <Txt variant="cap">Marked as made with AI. Songs can&apos;t copy real singers or bands.</Txt>
        </Card>
      )}
    </Screen>
  );
}

function lengthFor(sec: number | undefined): Length {
  if (!sec || sec <= 45) return sec ? "30" : "60";
  if (sec <= 90) return "60";
  return sec <= 150 ? "120" : sec <= 210 ? "180" : "240";
}
