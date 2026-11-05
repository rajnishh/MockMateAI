import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { api, type Song } from "@/lib/api";
import { Banner, Button, ChipRow, Txt } from "./ui";
import { type Range, Waveform } from "./waveform";

const SPEEDS = ["0.8", "0.9", "1", "1.1", "1.25"] as const;
const FADES = ["0", "1", "3", "5"] as const;
type Fade = (typeof FADES)[number];
const fadeOptions = FADES.map((v) => ({ value: v, label: v === "0" ? "None" : `${v} s` }));

// Trim on the waveform, fade and speed for a finished song. Free; saves a new copy.
export function StudioEdit({
  song,
  peaks,
  position,
  playingPart,
  playPart,
  onDone,
}: {
  song: Song;
  peaks: number[] | null;
  position?: number;
  playingPart: boolean;
  playPart: (r: Range | null) => void;
  onDone: (id: string) => void;
}) {
  const [keep, setKeep] = useState<Range>({ start: 0, end: song.durationSec });
  const [fadeIn, setFadeIn] = useState<Fade>("0");
  const [fadeOut, setFadeOut] = useState<Fade>("3");
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    playPart(null);
    try {
      const edited = await api.editSong(song.id, {
        startSec: keep.start,
        endSec: keep.end < song.durationSec ? keep.end : undefined,
        fadeInSec: Number(fadeIn),
        fadeOutSec: Number(fadeOut),
        speed: Number(speed),
      });
      onDone(edited.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <View style={styles.head}>
        <Txt variant="md" accessibilityRole="header">
          Trim
        </Txt>
        <Button label={playingPart ? "Stop" : "Play"} icon={playingPart ? undefined : "play"} kind="secondary" small onPress={() => playPart(playingPart ? null : keep)} />
      </View>
      <Waveform peaks={peaks} durationSec={song.durationSec} position={position} range={keep} onRange={setKeep} minSec={1} label="Keep" />
      <Txt variant="cap">Drag the edges to keep just the part you want, like a 30-second hook for a reel.</Txt>
      <View style={{ gap: 6 }}>
        <Txt variant="label">Fade in</Txt>
        <ChipRow options={fadeOptions} value={fadeIn} onChange={setFadeIn} />
      </View>
      <View style={{ gap: 6 }}>
        <Txt variant="label">Fade out</Txt>
        <ChipRow options={fadeOptions} value={fadeOut} onChange={setFadeOut} />
      </View>
      <View style={{ gap: 6 }}>
        <Txt variant="label">Speed</Txt>
        <ChipRow options={SPEEDS.map((v) => ({ value: v, label: v === "1" ? "Normal" : `${v}×` }))} value={speed} onChange={setSpeed} />
      </View>
      {error ? <Banner kind="error" text={error} /> : null}
      <Button label="Save as new copy · free" icon="check" block loading={saving} onPress={save} />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 44 },
});
