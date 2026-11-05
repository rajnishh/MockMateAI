import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { SongPlayerRow, useSongPlayer } from "@/components/song-player";
import { Banner, Button, Card, ChipRow, Field, Header, Row, Screen, Skeleton, Txt } from "@/components/ui";
import { api, ApiError, type RemixKind, type Song } from "@/lib/api";
import { formatTime, genreLabel, shareSong } from "@/lib/songs";
import { useData } from "@/lib/use-data";
import { fonts, radius, useTheme } from "@/theme";

type Panel = "edit" | "remix" | null;

const KINDS: { value: RemixKind; label: string; help: string }[] = [
  { value: "cover", label: "Cover", help: "Sing it again in another style." },
  { value: "extend", label: "Extend", help: "Make it longer. Add new lines at the end of the lyrics for the new part." },
  { value: "replace", label: "Replace a part", help: "Redo a few seconds you don't like. Change those lines in the lyrics if you want new words." },
];

export default function SongScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const song = useData(() => api.song(id));
  const studio = useData(() => api.songs());
  const player = useSongPlayer();
  const [panel, setPanel] = useState<Panel>(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = song.data;

  async function share() {
    if (!s) return;
    setSharing(true);
    setError(null);
    try {
      await shareSong(s);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSharing(false);
    }
  }

  // Edits and remixes are saved as new songs, so they show up in My songs.
  const done = () => router.dismissTo("/songs");

  return (
    <Screen>
      <Header title={s?.title ?? "Your song"} sub={s ? [genreLabel(s.genre), formatTime(s.durationSec), "Made with AI"].join(" · ") : undefined} back="/songs" />
      {song.error ? <Banner kind="error" text={song.error} action={<Button label="Retry" small kind="secondary" onPress={song.reload} />} /> : null}
      {!s ? (
        <Skeleton height={160} />
      ) : (
        <>
          <Card>
            <SongPlayerRow song={s} player={player} />
          </Card>
          <Button label="Save or share" icon="share" block loading={sharing} disabled={!s.audioUrl} onPress={share} />
          <Txt variant="cap" style={{ textAlign: "center" }}>
            Save to Files, or send it on WhatsApp and Instagram.
          </Txt>
          {error ? <Banner kind="error" text={error} /> : null}
          <Button label="Make music video" icon="film" kind="secondary" block disabled={s.status !== "completed"} onPress={() => router.push(`/songs/video/${s.id}`)} />

          <Card>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: panel === "edit" }} onPress={() => setPanel(panel === "edit" ? null : "edit")} style={styles.panelHead}>
              <View style={{ flex: 1 }}>
                <Txt variant="md">Trim, fade, speed</Txt>
                <Txt variant="cap">Free · saved as a new copy</Txt>
              </View>
              <Txt variant="label" color="tealText">
                {panel === "edit" ? "Close" : "Open"}
              </Txt>
            </Pressable>
            {panel === "edit" ? <EditPanel song={s} onDone={done} /> : null}
          </Card>

          {studio.data?.available !== false ? (
            <Card>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: panel === "remix" }} onPress={() => setPanel(panel === "remix" ? null : "remix")} style={styles.panelHead}>
                <View style={{ flex: 1 }}>
                  <Txt variant="md">Remix</Txt>
                  <Txt variant="cap">Cover, extend, or replace a part</Txt>
                </View>
                <Txt variant="label" color="tealText">
                  {panel === "remix" ? "Close" : "Open"}
                </Txt>
              </Pressable>
              {panel === "remix" ? <RemixPanel song={s} prices={studio.data?.remixCredits ?? { cover: 2, extend: 2, replace: 1 }} onDone={done} /> : null}
            </Card>
          ) : null}

          {s.lyrics && panel !== "remix" ? (
            <Card flat>
              <Txt variant="md">Lyrics</Txt>
              <Txt selectable>{s.lyrics}</Txt>
            </Card>
          ) : null}
          {s.contentCredentials ? <Txt variant="cap">Content Credentials: marked as AI-generated.</Txt> : null}
        </>
      )}
    </Screen>
  );
}

// A number with − and + buttons: no keyboard needed for a few seconds here and there.
function Stepper({ label, value, onChange, min, max, step, format = (n) => `${n} s` }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; step: number; format?: (n: number) => string }) {
  const { colors } = useTheme();
  const set = (n: number) => onChange(Math.min(max, Math.max(min, Math.round(n * 100) / 100)));
  const btn = (sign: 1 | -1) => {
    const off = sign < 0 ? value <= min : value >= max;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${sign < 0 ? "Less" : "More"} ${label.toLowerCase()}`}
        disabled={off}
        onPress={() => set(value + sign * step)}
        style={[styles.stepBtn, { borderColor: colors.lineStrong, opacity: off ? 0.4 : 1 }]}>
        <Txt variant="md">{sign < 0 ? "−" : "+"}</Txt>
      </Pressable>
    );
  };
  return (
    <View style={styles.stepper} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: format(value) }}>
      <Txt variant="label" style={{ flex: 1 }}>
        {label}
      </Txt>
      {btn(-1)}
      <Txt variant="mono" style={{ minWidth: 64, textAlign: "center", fontFamily: fonts.mono }}>
        {format(value)}
      </Txt>
      {btn(1)}
    </View>
  );
}

const SPEEDS = ["0.8", "0.9", "1", "1.1", "1.25"] as const;

// Crop, fade and speed for a finished song. Free; saves a new copy.
function EditPanel({ song, onDone }: { song: Song; onDone: () => void }) {
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(song.durationSec);
  const [fadeInSec, setFadeInSec] = useState(0);
  const [fadeOutSec, setFadeOutSec] = useState(3);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.editSong(song.id, { startSec, endSec: endSec < song.durationSec ? endSec : undefined, fadeInSec, fadeOutSec, speed: Number(speed) });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Stepper label="Start" value={startSec} onChange={setStartSec} min={0} max={Math.max(0, endSec - 1)} step={0.5} format={formatTime} />
      <Stepper label="End" value={endSec} onChange={setEndSec} min={startSec + 1} max={song.durationSec} step={0.5} format={formatTime} />
      <Stepper label="Fade in" value={fadeInSec} onChange={setFadeInSec} min={0} max={10} step={0.5} />
      <Stepper label="Fade out" value={fadeOutSec} onChange={setFadeOutSec} min={0} max={10} step={0.5} />
      <View style={{ gap: 6 }}>
        <Txt variant="cap">Speed</Txt>
        <ChipRow options={SPEEDS.map((v) => ({ value: v, label: v === "1" ? "Normal" : `${v}×` }))} value={speed} onChange={setSpeed} />
      </View>
      {error ? <Banner kind="error" text={error} /> : null}
      <Button label="Save as new copy · free" icon="check" block loading={saving} onPress={save} />
    </>
  );
}

// Suno-style remixing on ACE-Step. Each remix is saved as a new song.
function RemixPanel({ song, prices, onDone }: { song: Song; prices: Record<RemixKind, number>; onDone: () => void }) {
  const [kind, setKind] = useState<RemixKind>("cover");
  const [style, setStyle] = useState("");
  const [lyrics, setLyrics] = useState(song.lyrics);
  const [extendSec, setExtendSec] = useState<"15" | "30" | "60">("30");
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(Math.min(15, song.durationSec));
  const [busy, setBusy] = useState(false);
  const [styling, setStyling] = useState(false);
  const [error, setError] = useState<{ text: string; credits: boolean } | null>(null);

  async function enhanceStyle() {
    setStyling(true);
    setError(null);
    try {
      setStyle(await api.songStyle({ genre: song.genre, idea: style.trim() }));
    } catch (err) {
      setError({ text: (err as Error).message, credits: false });
    } finally {
      setStyling(false);
    }
  }

  async function remix() {
    setBusy(true);
    setError(null);
    try {
      await api.remixSong(song.id, {
        kind,
        ...(style.trim() ? { style: style.trim() } : {}),
        ...(lyrics.trim() !== song.lyrics.trim() ? { lyrics } : {}),
        ...(kind === "extend" ? { extendSec: Number(extendSec) } : {}),
        ...(kind === "replace" ? { startSec, endSec } : {}),
      });
      onDone();
    } catch (err) {
      setError({ text: (err as Error).message, credits: err instanceof ApiError && err.needCredits });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ChipRow<RemixKind> options={KINDS.map((k) => ({ value: k.value, label: `${k.label} · ${prices[k.value]}` }))} value={kind} onChange={setKind} />
      <Txt variant="cap">{KINDS.find((k) => k.value === kind)!.help}</Txt>
      <Field label={kind === "cover" ? "New style" : "Style (optional)"} value={style} onChangeText={setStyle} maxLength={300} placeholder="Lo-fi chill, soft piano, 75 bpm" />
      <Button label={styling ? "Writing…" : "✨ Enhance style"} kind="secondary" small disabled={styling} onPress={enhanceStyle} />
      {kind === "extend" ? (
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
      {kind === "replace" ? (
        <>
          <Stepper label="From" value={startSec} onChange={setStartSec} min={0} max={Math.max(0, endSec - 1)} step={1} format={formatTime} />
          <Stepper label="To" value={endSec} onChange={setEndSec} min={startSec + 1} max={song.durationSec} step={1} format={formatTime} />
        </>
      ) : null}
      {kind !== "cover" ? <Field label="Lyrics" value={lyrics} onChangeText={setLyrics} multiline maxLength={3000} style={{ minHeight: 160 }} /> : null}
      {error ? (
        <Banner
          kind="error"
          title={error.credits ? "Not enough credits" : undefined}
          text={error.text}
          action={error.credits ? <Button label="Get credits" small onPress={() => router.push("/credits")} /> : undefined}
        />
      ) : null}
      <Row>
        <Button label={`Remix · ${prices[kind]} ${prices[kind] === 1 ? "credit" : "credits"}`} icon="sparkle" block loading={busy} disabled={kind === "cover" && style.trim().length < 3} onPress={remix} style={{ flex: 1 }} />
      </Row>
    </>
  );
}

const styles = StyleSheet.create({
  panelHead: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
  stepBtn: { width: 44, height: 44, borderRadius: radius.pill, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
