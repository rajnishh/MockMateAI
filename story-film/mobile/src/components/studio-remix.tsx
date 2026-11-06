import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { api, ApiError, type RemixKindInfo, type Song } from "@/lib/api";
import { radius, useTheme } from "@/theme";
import { Banner, Button, ChipRow, Field, Txt } from "./ui";
import { type Range, Waveform } from "./waveform";

// Older servers send only prices; these match story-film/src/lib/songs/remix.ts. Prices always come
// from the server (the prices given), never from here.
export function fallbackKinds(prices: Record<string, number>): RemixKindInfo[] {
  const base = { style: "optional" as const, part: false, extend: false, lyrics: true, bars: false };
  const kinds: RemixKindInfo[] = [
    { ...base, kind: "cover", label: "Cover", help: "Sing it again in another style.", credits: 0, style: "required", lyrics: false },
    { ...base, kind: "extend", label: "Extend", help: "Make it longer. Add new lines at the end of the lyrics for the new part.", credits: 0, extend: true },
    { ...base, kind: "replace", label: "Replace part", help: "Pick a part you don't like and redo it. Change those lines in the lyrics for new words.", credits: 0, part: true },
    { ...base, kind: "rap", label: "Add a rap", help: "Pick a part and AI writes rap bars; that part is re-sung as a rap.", credits: 0, part: true, lyrics: false, bars: true },
  ];
  return kinds.filter((k) => prices[k.kind] !== undefined).map((k) => ({ ...k, credits: prices[k.kind] }));
}

// A part starts a third of the way in (often the first chorus) and runs 15 seconds.
export function defaultPart(durationSec: number, len = 15): Range {
  const l = Math.min(len, durationSec);
  const start = Math.min(Math.max(0, durationSec - l), Math.round(durationSec / 3));
  return { start, end: start + l };
}

const credits = (n: number) => `${n} ${n === 1 ? "credit" : "credits"}`;

// Suno-style remixing with the kinds the server lists. Each remix is saved as a new song.
export function StudioRemix({
  song,
  kinds,
  peaks,
  position,
  playingPart,
  playPart,
  onDone,
  primaryLabel,
  footnote,
}: {
  song: Song;
  kinds: RemixKindInfo[];
  peaks: number[] | null;
  position?: number;
  playingPart: boolean;
  playPart: (r: Range | null) => void;
  onDone: (id: string) => void;
  // The Make button's words for a kind ("Make cover · 1 credit"); the Studio uses the kind's label.
  primaryLabel?: (k: RemixKindInfo) => string;
  // A caption under the Make button, e.g. the balance.
  footnote?: string;
}) {
  const { colors } = useTheme();
  const [kind, setKind] = useState((kinds.find((x) => !x.unavailable) ?? kinds[0])?.kind ?? "cover");
  const [style, setStyle] = useState("");
  const [lyrics, setLyrics] = useState(song.lyrics);
  const [extendSec, setExtendSec] = useState<"15" | "30" | "60">("30");
  const [part, setPart] = useState<Range>(defaultPart(song.durationSec));
  const [idea, setIdea] = useState("");
  const [bars, setBars] = useState("");
  const [strength, setStrength] = useState<"0.25" | "0.5" | "0.8">("0.5");
  const [busy, setBusy] = useState(false);
  const [styling, setStyling] = useState(false);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<{ text: string; credits: boolean } | null>(null);
  const k = kinds.find((x) => x.kind === kind) ?? kinds[0];
  if (!k) return null;

  const fail = (err: unknown) => setError({ text: (err as Error).message, credits: err instanceof ApiError && err.needCredits });

  async function enhanceStyle() {
    setStyling(true);
    setError(null);
    try {
      setStyle(await api.songStyle({ genre: song.genre, idea: style.trim() }));
    } catch (err) {
      fail(err);
    } finally {
      setStyling(false);
    }
  }

  async function writeBars() {
    setWriting(true);
    setError(null);
    try {
      setBars(await api.songRap(song.id, { startSec: part.start, endSec: part.end, ...(idea.trim() ? { idea: idea.trim() } : {}) }));
    } catch (err) {
      fail(err);
    } finally {
      setWriting(false);
    }
  }

  async function remix() {
    setBusy(true);
    setError(null);
    playPart(null);
    try {
      const { id } = await api.remixSong(song.id, {
        kind: k.kind,
        ...(k.style !== "none" && style.trim() ? { style: style.trim() } : {}),
        // Add vocals always needs the words to sing; other kinds send lyrics only when changed.
        ...(k.lyrics && (k.kind === "add-vocals" || lyrics.trim() !== song.lyrics.trim()) ? { lyrics } : {}),
        ...(k.strength ? { strength: Number(strength) } : {}),
        ...(k.extend ? { extendSec: Number(extendSec) } : {}),
        ...(k.part ? { startSec: part.start, endSec: part.end } : {}),
        ...(k.bars ? { bars: bars.trim() } : {}),
      });
      onDone(id);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  const blocked = (k.style === "required" && style.trim().length < 3) || (k.bars && bars.trim().length < 10) || (k.kind === "add-vocals" && lyrics.trim().length < 10);
  return (
    <View style={{ gap: 14 }}>
      <View style={styles.kinds} accessibilityRole="radiogroup">
        {kinds.map((x) => {
          const on = x.kind === k.kind;
          return (
            <Pressable
              key={x.kind}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled: Boolean(x.unavailable) }}
              accessibilityLabel={`${x.label}, ${x.unavailable ?? credits(x.credits)}`}
              disabled={Boolean(x.unavailable)}
              onPress={() => setKind(x.kind)}
              style={({ pressed }) => [styles.kind, { opacity: x.unavailable ? 0.55 : 1, borderColor: on ? colors.brand : colors.lineStrong, backgroundColor: on ? colors.brand : colors.surfaceRaised, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
              {on ? <View pointerEvents="none" style={[styles.ring, { borderColor: colors.heroRing }]} /> : null}
              <Txt variant="label" color={on ? "onBrand" : "ink"}>
                {x.label}
              </Txt>
              <Txt variant="cap" color={on ? "onBrandMuted" : "inkMuted"}>
                {x.unavailable ?? credits(x.credits)}
              </Txt>
            </Pressable>
          );
        })}
      </View>
      <Txt variant="cap">{k.help}</Txt>

      {k.part ? (
        <View style={{ gap: 8 }}>
          <View style={styles.head}>
            <Txt variant="md" accessibilityRole="header">
              {k.bars ? "Part to rap over" : "Part to redo"}
            </Txt>
            <Button label={playingPart ? "Stop" : "Play part"} icon={playingPart ? undefined : "play"} kind="secondary" small onPress={() => playPart(playingPart ? null : part)} />
          </View>
          <Waveform peaks={peaks} durationSec={song.durationSec} position={position} range={part} onRange={setPart} minSec={3} maxSec={60} label="Part" />
          <Txt variant="cap">Drag the edges or the part itself. 3 to 60 seconds.</Txt>
        </View>
      ) : null}

      {k.bars ? (
        <>
          <Field label="What's the rap about? (optional)" value={idea} onChangeText={setIdea} maxLength={200} placeholder="Hustling in Mumbai, chai and big dreams" />
          <Button label={writing ? "Writing bars…" : bars ? "✨ Write new bars" : "✨ Write rap bars"} kind="tweak" block disabled={writing} loading={writing} onPress={writeBars} />
          <Field label="Rap bars" value={bars} onChangeText={setBars} multiline maxLength={1200} placeholder="Your own bars, one per line, or let AI write them." style={{ minHeight: 140 }} />
        </>
      ) : null}

      {k.style !== "none" ? (
        <>
          <Field label={k.style === "required" ? "New style" : "Style (optional)"} value={style} onChangeText={setStyle} maxLength={300} placeholder="Lo-fi chill, soft piano, 75 bpm" />
          <Button label={styling ? "Writing…" : "✨ Enhance style"} kind="secondary" small disabled={styling} onPress={enhanceStyle} />
        </>
      ) : null}

      {k.strength ? (
        <View style={{ gap: 6 }}>
          <Txt variant="cap">How different</Txt>
          <ChipRow<"0.25" | "0.5" | "0.8">
            options={[
              { value: "0.25", label: "Close to the original" },
              { value: "0.5", label: "In between" },
              { value: "0.8", label: "A whole new take" },
            ]}
            value={strength}
            onChange={setStrength}
          />
        </View>
      ) : null}

      {k.extend ? (
        <View style={{ gap: 6 }}>
          <Txt variant="cap">Add</Txt>
          <ChipRow<"15" | "30" | "60">
            options={[
              { value: "15", label: "15 seconds" },
              { value: "30", label: "30 seconds" },
              { value: "60", label: "60 seconds" },
            ]}
            value={extendSec}
            onChange={setExtendSec}
          />
        </View>
      ) : null}
      {k.lyrics ? <Field label="Lyrics" value={lyrics} onChangeText={setLyrics} multiline maxLength={3000} style={{ minHeight: 160 }} /> : null}
      {error ? (
        <Banner
          kind="error"
          title={error.credits ? "Not enough credits" : undefined}
          text={error.text}
          action={error.credits ? <Button label="Get credits" small onPress={() => router.push("/credits")} /> : undefined}
        />
      ) : null}
      <Button label={primaryLabel ? primaryLabel(k) : `${k.label} · ${credits(k.credits)}`} icon="sparkle" block loading={busy} disabled={blocked || Boolean(k.unavailable)} onPress={remix} />
      {k.bars && bars.trim().length < 10 ? <Txt variant="cap">Write the bars or let AI write them.</Txt> : footnote ? <Txt variant="cap">{footnote}</Txt> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  kinds: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kind: { flexBasis: "47%", flexGrow: 1, minHeight: 60, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.lg, borderWidth: 1.5, justifyContent: "center", overflow: "hidden" },
  ring: { position: "absolute", right: -20, top: -20, width: 56, height: 56, borderRadius: 28, borderWidth: 9 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 44 },
});
