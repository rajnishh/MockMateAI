import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Dial, ModeSwitch, StructureBlocks } from "@/components/song-create";
import { Banner, Button, Chip, ChipRow, Credits, Field, Header, Row, Screen, Txt } from "@/components/ui";
import { api, ApiError, type SongMode, type SongModel, type SongOptions, type SongVocal } from "@/lib/api";
import { useSession } from "@/lib/session";
import { insertRap, onlyTags, structureOf } from "@/lib/song-structure";
import { addStyleChip, MOODS, SONG_LANGUAGES, STYLE_CHIPS, STYLE_PRESETS } from "@/lib/songs";
import { useData } from "@/lib/use-data";

type Length = "short" | "30" | "60" | "120";

const MODES: { value: SongMode; label: string; help: string }[] = [
  { value: "simple", label: "Simple", help: "One sentence" },
  { value: "custom", label: "Custom", help: "Every control" },
  { value: "instrumental", label: "Instrumental", help: "No vocals" },
];

const VOICES: { value: SongVocal; label: string }[] = [
  { value: "auto", label: "Any" },
  { value: "female", label: "♀ Female" },
  { value: "male", label: "♂ Male" },
  { value: "duet", label: "♀♂ Duet" },
];

// Mirrors KEY_SCALES in story-film/src/lib/songs/controls.ts.
const KEYS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const BPMS = [70, 84, 96, 110, 128, 140];

// Song Studio's Create, like the web app's /songs form: same API, same prices.
export default function NewSong() {
  const { prefs } = useSession();
  // Links like /songs/new?mode=instrumental open straight on a mode.
  const params = useLocalSearchParams<{ mode?: string }>();
  const studio = useData(() => api.songs());
  const billing = useData(() => api.billing());
  const [mode, setMode] = useState<SongMode>(MODES.find((m) => m.value === params.mode)?.value ?? "simple");
  const [topic, setTopic] = useState("");
  const [genre, setGenre] = useState("desi-hip-hop");
  const [mood, setMood] = useState("happy");
  const [language, setLanguage] = useState(prefs?.language ?? "hinglish");
  const [length, setLength] = useState<Length>("60");
  const [kidSafe, setKidSafe] = useState(false);
  const [title, setTitle] = useState("");
  // The lyrics are the source of truth for the structure blocks: blocks are read from its [tags].
  const [lyrics, setLyrics] = useState("[Verse]\n\n[Chorus]\n\n[Verse]\n\n[Chorus]");
  const [style, setStyle] = useState("");
  const [vocal, setVocal] = useState<SongVocal>("auto");
  const [twoTakes, setTwoTakes] = useState(true);
  const [experiment, setExperiment] = useState(50);
  const [strictness, setStrictness] = useState(0);
  const [bpm, setBpm] = useState<number | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [minor, setMinor] = useState(false);
  const [writing, setWriting] = useState<"write" | "enhance" | "rap" | null>(null);
  const [styling, setStyling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; credits: boolean } | null>(null);

  const model: SongModel = length === "short" ? "lyria" : "ace-step";
  const short = model === "lyria";
  const credits = studio.data?.credits ?? 4;
  const available = studio.data?.available !== false;
  const options: SongOptions = { topic: topic.trim(), genre, mood, language, durationSec: short ? 30 : (Number(length) as SongOptions["durationSec"]), kidSafe };
  const noWords = onlyTags(lyrics);
  const duet = vocal === "duet";
  const blocked = !available || (mode === "custom" ? !title.trim() || lyrics.trim().length < 20 || noWords : topic.trim().length < 3 && !title.trim());

  function fail(err: unknown) {
    setError({ text: (err as Error).message, credits: err instanceof ApiError && err.needCredits });
  }

  // With words already in the box, AI grows them into a full song and keeps them; with only blocks, it writes in that shape.
  async function writeWithAi(enhance: boolean) {
    setWriting(enhance ? "enhance" : "write");
    setError(null);
    try {
      const structure = structureOf(lyrics);
      const shape = { structure: structure.length ? structure : undefined, duet };
      const out = await api.songLyrics(enhance ? { ...options, ...shape, draft: lyrics } : { ...options, ...shape });
      if (!title || !enhance) setTitle(out.title);
      setLyrics(out.lyrics);
    } catch (err) {
      fail(err);
    } finally {
      setWriting(null);
    }
  }

  async function writeRap() {
    setWriting("rap");
    setError(null);
    try {
      const bars = await api.songRapVerse({ ...options, lyrics, bars: 8 });
      setLyrics((l) => insertRap(l, bars));
    } catch (err) {
      fail(err);
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
      fail(err);
    } finally {
      setStyling(false);
    }
  }

  async function make() {
    setBusy(true);
    setError(null);
    try {
      await api.createSong({
        ...options,
        mode,
        title: title.trim(),
        // Simple mode sends only the shape; AI writes the words.
        lyrics: mode === "custom" ? lyrics : "",
        structure: mode === "simple" ? structureOf(lyrics) : undefined,
        style: mode === "simple" ? undefined : style.trim() || undefined,
        vocal: mode === "instrumental" ? "auto" : vocal,
        takes: twoTakes ? 2 : 1,
        model,
        experiment,
        strictness,
        bpm: bpm ?? undefined,
        keyScale: key ? `${key} ${minor ? "minor" : "major"}` : undefined,
      });
      router.dismissTo("/songs");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={
        <>
          <Button label={`${twoTakes ? "Make 2 versions" : "Make song"} · ${credits} credits`} icon="music" block disabled={blocked} loading={busy} onPress={make} />
          <Txt variant="cap" style={{ textAlign: "center" }}>
            {!available
              ? "Song Studio isn't set up on this server yet"
              : blocked
                ? mode === "custom"
                  ? "Add a title and lyrics, or write them with AI"
                  : "Say in a sentence what the song is about"
                : busy && mode === "simple"
                  ? "Writing your lyrics and sound…"
                  : "About a minute · with AI cover art · you can leave this screen"}
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

      <ModeSwitch options={MODES} value={mode} onChange={setMode} />

      <Field
        label={mode === "simple" ? "Describe your song in one sentence" : mode === "instrumental" ? "What should it feel like?" : "What is the song about?"}
        value={topic}
        onChangeText={setTopic}
        maxLength={300}
        multiline
        placeholder={mode === "instrumental" ? "A late-night drive through Dubai, warm and slow" : "A Hinglish hip-hop song about chasing dreams with chai and friends"}
        style={{ minHeight: mode === "simple" ? 110 : 80, fontSize: mode === "simple" ? 18 : 16 }}
      />
      {mode === "simple" ? <Txt variant="cap">AI writes the title, lyrics and sound.</Txt> : null}

      <View style={{ gap: 6 }}>
        <Txt variant="cap">Style</Txt>
        <ChipRow options={STYLE_PRESETS} value={genre} onChange={setGenre} />
      </View>

      {mode !== "instrumental" ? (
        <>
          <View style={{ gap: 6 }}>
            <Txt variant="cap">Language</Txt>
            <ChipRow options={SONG_LANGUAGES} value={language} onChange={setLanguage} />
          </View>
          <View style={{ gap: 6 }}>
            <Txt variant="cap">Voice</Txt>
            <ChipRow<SongVocal> options={VOICES} value={vocal} onChange={setVocal} />
            {duet ? <Txt variant="cap">Tap a block, then pick who sings it. AI alternates verses between the male and female voice.</Txt> : null}
          </View>
        </>
      ) : null}

      <View style={{ gap: 6 }}>
        <Txt variant="cap">Mood</Txt>
        <ChipRow options={MOODS} value={mood} onChange={setMood} />
      </View>
      <View style={{ gap: 6 }}>
        <Txt variant="cap">Length</Txt>
        <ChipRow<Length>
          options={[
            { value: "short", label: "⚡ 30 s short" },
            { value: "30", label: "30 s" },
            { value: "60", label: "1 min" },
            { value: "120", label: "2 min" },
          ]}
          value={length}
          onChange={setLength}
        />
        {short ? <Txt variant="cap">A 30-second song for a reel or a hook, made with Google Lyria. Keep the lyrics short: about 6–8 lines.</Txt> : null}
      </View>

      {mode !== "instrumental" ? (
        <View style={{ gap: 6 }}>
          <Txt variant="label">Song structure</Txt>
          <StructureBlocks lyrics={lyrics} onChange={setLyrics} duet={duet} dimEmpty={mode === "custom"} />
        </View>
      ) : null}

      {mode === "custom" ? (
        <>
          <Row>
            <Button label={writing === "write" ? "Writing…" : noWords ? "✨ Write lyrics with AI" : "✨ Rewrite with AI"} disabled={writing !== null || topic.trim().length < 3} onPress={() => writeWithAi(false)} small />
            <Button label={writing === "rap" ? "Writing bars…" : "✨ Write a rap verse"} kind="tweak" small disabled={writing !== null || (topic.trim().length < 3 && noWords)} onPress={writeRap} />
          </Row>
          <Field label="Title" value={title} onChangeText={setTitle} maxLength={80} placeholder="Chai Ke Saath" />
          <Field label="Lyrics" value={lyrics} onChangeText={setLyrics} multiline maxLength={3000} placeholder={"[Verse]\n…\n\n[Chorus]\n…"} style={{ minHeight: 240 }} />
          <Button label={writing === "enhance" ? "Writing…" : "✨ Enhance my lyrics"} kind="secondary" small disabled={writing !== null || noWords || lyrics.trim().length < 10} onPress={() => writeWithAi(true)} />
          <Txt variant="cap">Write a few lines of your own; AI makes them a full song and keeps your lines.</Txt>
        </>
      ) : null}

      {mode !== "simple" ? (
        <>
          <Field
            label="Sound (optional)"
            value={style}
            onChangeText={setStyle}
            multiline
            maxLength={500}
            placeholder="Dark trap beat, tabla and 808s. Leave empty to use the style above."
            style={{ minHeight: 80 }}
          />
          <Row>
            {STYLE_CHIPS.map((chip) => {
              const on = style.toLowerCase().includes(chip);
              return <Chip key={chip} label={on ? chip : `+ ${chip}`} selected={on} onPress={() => setStyle((s) => addStyleChip(s, chip))} />;
            })}
          </Row>
          <Button label={styling ? "Writing…" : "✨ Enhance style"} kind="secondary" small disabled={styling} onPress={enhanceStyle} />

          {short ? null : (
            <>
              <Dial label="Experiment" left="Safe" right="Wild" value={experiment} onChange={setExperiment} />
              <Dial label="Follow my style" left="Loose" right="Strict" value={strictness} onChange={setStrictness} />
              {strictness > 0 ? <Txt variant="cap">A stricter style takes a few minutes longer to make.</Txt> : null}
            </>
          )}
          <View style={{ gap: 6 }}>
            <Txt variant="cap">Tempo</Txt>
            <ChipRow<string>
              options={[{ value: "auto", label: "Auto" }, ...BPMS.map((b) => ({ value: String(b), label: `${b} BPM` }))]}
              value={bpm ? String(bpm) : "auto"}
              onChange={(v) => setBpm(v === "auto" ? null : Number(v))}
            />
          </View>
          <View style={{ gap: 6 }}>
            <Txt variant="cap">Key</Txt>
            <ChipRow<string> options={[{ value: "auto", label: "Auto" }, ...KEYS.map((k) => ({ value: k, label: k }))]} value={key ?? "auto"} onChange={(v) => setKey(v === "auto" ? null : v)} />
            {key ? (
              <ChipRow<"major" | "minor">
                options={[
                  { value: "major", label: "Major · bright" },
                  { value: "minor", label: "Minor · moody" },
                ]}
                value={minor ? "minor" : "major"}
                onChange={(v) => setMinor(v === "minor")}
              />
            ) : null}
          </View>
          {mode === "instrumental" ? <Field label="Title (optional)" value={title} onChangeText={setTitle} maxLength={80} placeholder="Taken from your idea when empty" /> : null}
        </>
      ) : null}

      <Row>
        {mode !== "instrumental" ? <Chip label="For kids" selected={kidSafe} onPress={() => setKidSafe(!kidSafe)} /> : null}
        <Chip label="2 versions · same price" selected={twoTakes} onPress={() => setTwoTakes(!twoTakes)} />
      </Row>
      <Txt variant="cap">Songs can&apos;t name or imitate real singers or bands. Every song gets AI cover art and is marked as made with AI.</Txt>
    </Screen>
  );
}
