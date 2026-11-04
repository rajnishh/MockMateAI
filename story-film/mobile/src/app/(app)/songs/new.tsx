import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Banner, Button, Chip, ChipRow, Credits, Field, Header, Row, Screen, Txt } from "@/components/ui";
import { api, ApiError, type SongModel, type SongOptions, type SongVocal } from "@/lib/api";
import { useSession } from "@/lib/session";
import { addStyleChip, GENRES, MOODS, SONG_LANGUAGES, STYLE_CHIPS, VOCALS } from "@/lib/songs";
import { useData } from "@/lib/use-data";

type Length = "30" | "60" | "120";

// Song Studio's Create, like the web app's /songs form: same API, same prices.
export default function NewSong() {
  const { prefs } = useSession();
  const studio = useData(() => api.songs());
  const billing = useData(() => api.billing());
  const [model, setModel] = useState<SongModel>("ace-step");
  const [topic, setTopic] = useState("");
  const [genre, setGenre] = useState("bollywood-romantic");
  const [mood, setMood] = useState("happy");
  const [language, setLanguage] = useState(prefs?.language ?? "hi");
  const [length, setLength] = useState<Length>("60");
  const [kidSafe, setKidSafe] = useState(false);
  const [title, setTitle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [style, setStyle] = useState("");
  const [vocal, setVocal] = useState<SongVocal>("auto");
  const [twoTakes, setTwoTakes] = useState(true);
  const [writing, setWriting] = useState<"write" | "enhance" | null>(null);
  const [styling, setStyling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; credits: boolean } | null>(null);

  const short = model === "lyria";
  const credits = studio.data?.credits ?? 4;
  const available = studio.data?.available !== false;
  const options: SongOptions = { topic: topic.trim(), genre, mood, language, durationSec: short ? 30 : (Number(length) as SongOptions["durationSec"]), kidSafe };
  const blocked = !title.trim() || lyrics.trim().length < 20 || !available;

  // With lines already in the box, AI grows them into a full song and keeps them; otherwise it writes from the topic.
  async function writeWithAi(enhance: boolean) {
    setWriting(enhance ? "enhance" : "write");
    setError(null);
    try {
      const out = await api.songLyrics(enhance ? { ...options, draft: lyrics } : options);
      if (!title || !enhance) setTitle(out.title);
      setLyrics(out.lyrics);
    } catch (err) {
      setError({ text: (err as Error).message, credits: false });
    } finally {
      setWriting(null);
    }
  }

  async function enhanceStyle() {
    setStyling(true);
    setError(null);
    try {
      setStyle(await api.songStyle({ ...options, idea: style.trim() || topic.trim(), vocal }));
    } catch (err) {
      setError({ text: (err as Error).message, credits: false });
    } finally {
      setStyling(false);
    }
  }

  async function make() {
    setBusy(true);
    setError(null);
    try {
      await api.createSong({ ...options, title: title.trim(), lyrics, style: style.trim() || undefined, vocal, takes: twoTakes ? 2 : 1, model });
      router.dismissTo("/songs");
    } catch (err) {
      setError({ text: (err as Error).message, credits: err instanceof ApiError && err.needCredits });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={
        <>
          <Button label={`Make song · ${credits} credits`} icon="music" block disabled={blocked} loading={busy} onPress={make} />
          <Txt variant="cap" style={{ textAlign: "center" }}>
            {!available
              ? "Song Studio isn't set up on this server yet"
              : blocked
                ? "Add a title and lyrics, or write them with AI"
                : `${twoTakes ? "2 versions to choose from" : "1 version"} · about a minute · you can leave this screen`}
          </Txt>
        </>
      }>
      <Header title="New song" back right={<Credits count={billing.data?.balance ?? null} />} />
      {!available ? <Banner kind="warn" text="Song Studio isn't set up on this server yet." /> : null}
      {error ? (
        <Banner
          kind="error"
          title={error.credits ? "Not enough credits" : undefined}
          text={error.text}
          action={error.credits ? <Button label="Get credits" small onPress={() => router.push("/credits")} /> : undefined}
        />
      ) : null}

      <View style={{ gap: 6 }}>
        <Txt variant="cap">Song</Txt>
        <ChipRow<SongModel>
          options={[
            { value: "ace-step", label: "Full song" },
            { value: "lyria", label: "Short song · 30 s" },
          ]}
          value={model}
          onChange={setModel}
        />
        {short ? <Txt variant="cap">A 30-second song for a reel or a hook, made with Google Lyria. Keep the lyrics short: about 6–8 lines.</Txt> : null}
      </View>

      <Field label="What is the song about?" value={topic} onChangeText={setTopic} maxLength={300} placeholder="My grandmother's kitchen on a rainy day" returnKeyType="done" />
      <Button
        label={writing === "write" ? "Writing…" : "✨ Write lyrics with AI"}
        kind="tweak"
        disabled={writing !== null || topic.trim().length < 3}
        onPress={() => writeWithAi(false)}
      />

      <View style={{ gap: 6 }}>
        <Txt variant="cap">Style</Txt>
        <ChipRow options={GENRES} value={genre} onChange={setGenre} />
      </View>
      <View style={{ gap: 6 }}>
        <Txt variant="cap">Mood</Txt>
        <ChipRow options={MOODS} value={mood} onChange={setMood} />
      </View>
      <View style={{ gap: 6 }}>
        <Txt variant="cap">Language</Txt>
        <ChipRow options={SONG_LANGUAGES} value={language} onChange={setLanguage} />
      </View>
      {short ? null : (
        <View style={{ gap: 6 }}>
          <Txt variant="cap">Length</Txt>
          <ChipRow<Length>
            options={[
              { value: "30", label: "30 s" },
              { value: "60", label: "1 min" },
              { value: "120", label: "2 min" },
            ]}
            value={length}
            onChange={setLength}
          />
        </View>
      )}
      <Row>
        <Chip label="For kids" selected={kidSafe} onPress={() => setKidSafe(!kidSafe)} />
      </Row>

      <Field label="Title" value={title} onChangeText={setTitle} maxLength={80} placeholder="Baarish wali chai" />
      <Field
        label="Lyrics"
        value={lyrics}
        onChangeText={setLyrics}
        multiline
        maxLength={3000}
        placeholder={"[Verse]\n…\n\n[Chorus]\n…"}
        style={{ minHeight: 220 }}
      />
      <Txt variant="cap">Put [Verse] and [Chorus] on their own lines. Write a few lines of your own and AI makes them a full song, keeping your lines.</Txt>
      <Button
        label={writing === "enhance" ? "Writing…" : "✨ Enhance my lyrics"}
        kind="secondary"
        disabled={writing !== null || lyrics.trim().length < 10}
        onPress={() => writeWithAi(true)}
      />

      <Field
        label="Sound (optional)"
        value={style}
        onChangeText={setStyle}
        multiline
        maxLength={500}
        placeholder="Sad papa-beti song, soft piano. Leave empty to use the style above."
        style={{ minHeight: 80 }}
      />
      <Row>
        {STYLE_CHIPS.map((chip) => {
          const on = style.toLowerCase().includes(chip);
          return <Chip key={chip} label={on ? chip : `+ ${chip}`} selected={on} onPress={() => setStyle((s) => addStyleChip(s, chip))} />;
        })}
      </Row>
      <Button label={styling ? "Writing…" : "✨ Enhance style"} kind="secondary" disabled={styling} onPress={enhanceStyle} />
      <Txt variant="cap">Turns a few words into a detailed sound: instruments, tempo, vocals.</Txt>

      <View style={{ gap: 6 }}>
        <Txt variant="cap">Voice</Txt>
        <ChipRow<SongVocal> options={VOCALS} value={vocal} onChange={setVocal} />
      </View>
      <View style={{ gap: 6 }}>
        <Txt variant="cap">Versions</Txt>
        <ChipRow<"2" | "1">
          options={[
            { value: "2", label: "2 versions · same price" },
            { value: "1", label: "1 version" },
          ]}
          value={twoTakes ? "2" : "1"}
          onChange={(v) => setTwoTakes(v === "2")}
        />
      </View>
      <Txt variant="cap">Songs can&apos;t name or imitate real singers or bands. Marked as made with AI.</Txt>
    </Screen>
  );
}
