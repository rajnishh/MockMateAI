import { router } from "expo-router";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, PanResponder, Pressable, StyleSheet, View } from "react-native";

import { api, ApiError, type Song, type SoundPreset, type StemName } from "@/lib/api";
import { formatTime } from "@/lib/songs";
import { useData } from "@/lib/use-data";
import { radius, useTheme } from "@/theme";
import { Icon } from "./icon";
import { Banner, Button, Txt } from "./ui";

const STEMS: { id: StemName; label: string; color: "brand" | "teal" | "pop" | "inkMuted" }[] = [
  { id: "vocals", label: "Vocals", color: "brand" },
  { id: "drums", label: "Drums", color: "teal" },
  { id: "bass", label: "Bass", color: "pop" },
  { id: "other", label: "Music", color: "inkMuted" },
];
type Gains = Record<StemName, number>;

// Older servers don't list their sounds; these match story-film/src/lib/songs/mix.ts.
export const FALLBACK_PRESETS: SoundPreset[] = [
  { id: "master", label: "Studio master", help: "Loud and clear, ready for Reels (-14 LUFS)." },
  { id: "bass", label: "Bass boost", help: "More low end for phone speakers and cars." },
  { id: "hall", label: "Hall reverb", help: "Sung in a big hall." },
  { id: "lofi", label: "Lo-fi tape", help: "Warm, wobbly and a bit dusty." },
  { id: "8d", label: "8D audio", help: "Moves around your head. Best on headphones." },
  { id: "slowed", label: "Slowed + reverb", help: "Slower, lower and dreamy." },
];

// Volume after mute and solo: soloed stems play alone; muted ones are silent.
export function heardGain(stem: StemName, gains: Gains, muted: Set<StemName>, solo: Set<StemName>): number {
  if (solo.size) return solo.has(stem) ? gains[stem] : 0;
  return muted.has(stem) ? 0 : gains[stem];
}

// The four stems in four players started together, so levels are heard live.
function useStemPlayers(urls: Record<StemName, string> | null) {
  const players = { vocals: useAudioPlayer(null), drums: useAudioPlayer(null), bass: useAudioPlayer(null), other: useAudioPlayer(null) };
  const status = useAudioPlayerStatus(players.vocals);
  const [loaded, setLoaded] = useState<string | null>(null);

  async function load() {
    if (!urls || loaded === urls.vocals) return;
    const headers = await api.videoHeaders();
    STEMS.forEach((s) => players[s.id].replace({ uri: api.stemUrl(urls[s.id]), headers }));
    setLoaded(urls.vocals);
  }

  return {
    playing: status.playing,
    loading: loaded !== null && !status.isLoaded,
    position: status.currentTime,
    async play(from: number, gainOf: (s: StemName) => number) {
      await load();
      const at = status.duration > 0 && from >= status.duration - 0.25 ? 0 : from;
      await Promise.all(STEMS.map((s) => players[s.id].seekTo(at)));
      setLevels(gainOf);
      STEMS.forEach((s) => players[s.id].play());
    },
    pause: () => STEMS.forEach((s) => players[s.id].pause()),
    setLevels,
  };

  // Players top out at full volume, so a stem turned above 100% plays at full and the rest are
  // scaled down to keep the balance.
  function setLevels(gainOf: (s: StemName) => number) {
    const top = Math.max(1, ...STEMS.map((s) => gainOf(s.id)));
    STEMS.forEach((s) => {
      players[s.id].volume = gainOf(s.id) / top;
    });
  }
}

// A level from 0 to 200%, dragged along a 44 pt track or adjusted with VoiceOver.
function Level({ label, value, onChange, color }: { label: string; value: number; onChange: (v: number) => void; color: string }) {
  const { colors } = useTheme();
  const width = useRef(0);
  const start = useRef(0);
  const live = useRef(onChange);
  useLayoutEffect(() => {
    live.current = onChange;
  });
  const set = (v: number) => live.current(Math.round(Math.min(2, Math.max(0, v)) * 20) / 20);
  // The handlers read the refs only inside touch callbacks, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        start.current = (e.nativeEvent.locationX / Math.max(1, width.current)) * 2;
        set(start.current);
      },
      onPanResponderMove: (_e, g) => set(start.current + (g.dx / Math.max(1, width.current)) * 2),
    }),
  );
  return (
    <View
      {...pan.panHandlers}
      onLayout={(e) => (width.current = e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${label} volume`}
      accessibilityValue={{ min: 0, max: 200, now: Math.round(value * 100), text: `${Math.round(value * 100)}%` }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => set(value + (e.nativeEvent.actionName === "increment" ? 0.1 : -0.1))}
      style={styles.level}>
      <View pointerEvents="none" style={[styles.track, { backgroundColor: colors.line }]}>
        <View style={{ width: `${(value / 2) * 100}%`, height: "100%", borderRadius: 6, backgroundColor: color }} />
      </View>
      <View pointerEvents="none" style={[styles.knob, { left: `${(value / 2) * 100}%`, borderColor: colors.ink, backgroundColor: colors.surfaceRaised }]} />
    </View>
  );
}

function Toggle({ label, on, onPress, onColor, a11y }: { label: string; on: boolean; onPress: () => void; onColor: string; a11y: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={a11y}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={[styles.ms, { backgroundColor: on ? onColor : colors.surfaceRaised, borderColor: on ? onColor : colors.lineStrong }]}>
      <Txt variant="label" style={{ color: on ? colors.surfaceRaised : colors.ink }}>
        {label}
      </Txt>
    </Pressable>
  );
}

// The Mix tab: split into stems, set levels with mute and solo, pick a sound, save as a new song.
export function StudioMix({ song, presets, stemsCredits, position, pauseSong, onSaved }: { song: Song; presets: SoundPreset[]; stemsCredits: number; position: number; pauseSong: () => void; onSaved: (id: string) => void }) {
  const { colors } = useTheme();
  const stemsData = useData(() => api.songStems(song.id));
  const stems = stemsData.data;
  const [gains, setGains] = useState<Gains>({ vocals: 1, drums: 1, bass: 1, other: 1 });
  const [muted, setMuted] = useState<Set<StemName>>(new Set());
  const [solo, setSolo] = useState<Set<StemName>>(new Set());
  const [preset, setPreset] = useState<string | null>(null);
  // The sound last previewed; it's playing while the preview player is.
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; credits?: boolean } | null>(null);
  const ready = stems?.status === "ready";
  const mixer = useStemPlayers(ready ? stems.stems : null);
  const preview = useAudioPlayer(null);
  const previewStatus = useAudioPlayerStatus(preview);

  const hearing = (id: string) => previewing === id && (previewStatus.playing || !previewStatus.isLoaded);

  useEffect(() => {
    if (stems?.status !== "running") return;
    const t = setTimeout(stemsData.reload, 3000);
    return () => clearTimeout(t);
  }, [stems, stemsData.reload]);

  useEffect(() => {
    mixer.setLevels((s) => heardGain(s, gains, muted, solo));
    // The players keep their identity; only the levels change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gains, muted, solo]);

  async function split() {
    setError(null);
    try {
      await api.splitSong(song.id);
      await stemsData.reload();
    } catch (err) {
      setError({ text: (err as Error).message, credits: err instanceof ApiError && err.needCredits });
    }
  }

  function stopPreview() {
    preview.pause();
    setPreviewing(null);
  }

  async function togglePlay() {
    if (mixer.playing) return mixer.pause();
    pauseSong();
    stopPreview();
    await mixer.play(mixer.position || position, (s) => heardGain(s, gains, muted, solo));
  }

  async function hear(id: string) {
    mixer.pause();
    pauseSong();
    if (hearing(id)) return stopPreview();
    const uri = api.soundPreviewUrl(song.id, id);
    if (!uri) return setError({ text: "Sound previews need the Reelkar server, not the demo" });
    preview.replace({ uri, headers: await api.videoHeaders() });
    preview.play();
    setPreviewing(id);
    setPreset(id);
  }

  const flip = (set: Set<StemName>, stem: StemName, update: (s: Set<StemName>) => void) => {
    const next = new Set(set);
    if (next.has(stem)) next.delete(stem);
    else next.add(stem);
    update(next);
  };

  const changed = ready && STEMS.some((s) => Math.abs(heardGain(s.id, gains, muted, solo) - 1) > 0.01);
  const silent = ready && STEMS.every((s) => heardGain(s.id, gains, muted, solo) === 0);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      mixer.pause();
      stopPreview();
      const { id } = await api.saveMix(song.id, {
        ...(changed ? { gains: Object.fromEntries(STEMS.map((s) => [s.id, heardGain(s.id, gains, muted, solo)])) } : {}),
        ...(preset ? { preset } : {}),
      });
      onSaved(id);
    } catch (err) {
      setError({ text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const credits = stems?.credits ?? stemsCredits;
  return (
    <View style={{ gap: 14 }}>
      <View style={styles.head}>
        <Txt variant="md" accessibilityRole="header">
          Parts
        </Txt>
        {ready ? <Button label={mixer.playing ? `Pause · ${formatTime(mixer.position)}` : "Play mix"} icon={mixer.playing ? undefined : "play"} kind="secondary" small loading={mixer.loading} onPress={togglePlay} /> : null}
      </View>

      {!stems || stems.status === "none" || stems.status === "failed" ? (
        <View style={[styles.well, { backgroundColor: colors.surfaceSunken }]}>
          <Txt variant="body" color="inkMuted">
            Split the song into vocals, drums, bass and music to turn each one up or down.
          </Txt>
          {stems?.status === "failed" ? <Txt color="danger">{`${stems.error ?? "Splitting didn't work"}. Your credit was refunded.`}</Txt> : null}
          <Button
            label={`${stems?.status === "failed" ? "Try again" : "Split into parts"} · ${credits} ${credits === 1 ? "credit" : "credits"}`}
            icon="sparkle"
            block
            disabled={!stems}
            onPress={split}
          />
        </View>
      ) : stems.status === "running" ? (
        <View style={[styles.well, { backgroundColor: colors.surfaceSunken, alignItems: "center" }]} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.brand} />
          <Txt variant="body" color="inkMuted" style={{ textAlign: "center" }}>
            Splitting into vocals, drums, bass and music. About a minute.
          </Txt>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {STEMS.map((s) => {
            const heard = heardGain(s.id, gains, muted, solo);
            return (
              <View key={s.id} style={[styles.stem, { backgroundColor: colors.surfaceSunken, borderLeftColor: colors[s.color], opacity: heard === 0 ? 0.55 : 1 }]}>
                <View style={styles.stemTop}>
                  <Txt variant="label" style={{ flex: 1 }}>
                    {s.label}
                  </Txt>
                  <Txt variant="mono" color="inkMuted">{`${Math.round(gains[s.id] * 100)}%`}</Txt>
                  <Toggle label="M" a11y={`Mute ${s.label}`} on={muted.has(s.id)} onPress={() => flip(muted, s.id, setMuted)} onColor={colors.action} />
                  <Toggle label="S" a11y={`Solo ${s.label}`} on={solo.has(s.id)} onPress={() => flip(solo, s.id, setSolo)} onColor={colors.tealText} />
                </View>
                <Level label={s.label} value={gains[s.id]} onChange={(v) => setGains((g) => ({ ...g, [s.id]: v }))} color={colors[s.color]} />
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.head}>
        <Txt variant="md" accessibilityRole="header">
          Sound
        </Txt>
        <Txt variant="cap">Free · tap ▶ to hear 30 s</Txt>
      </View>
      <View style={{ gap: 8 }} accessibilityRole="radiogroup">
        {presets.map((p) => {
          const on = preset === p.id;
          return (
            <View key={p.id} style={[styles.fx, { borderColor: on ? colors.deep : colors.lineStrong, backgroundColor: on ? colors.deep : colors.surfaceRaised }]}>
              <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityHint={p.help} onPress={() => setPreset(on ? null : p.id)} style={styles.fxPick}>
                <Txt variant="label" color={on ? "onDeep" : "ink"}>
                  {p.label}
                </Txt>
                <Txt variant="cap" color={on ? "onDeep" : "inkMuted"} style={{ opacity: on ? 0.8 : 1 }}>
                  {p.help}
                </Txt>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={hearing(p.id) ? `Stop ${p.label} preview` : `Hear ${p.label}`}
                onPress={() => hear(p.id)}
                style={[styles.fxHear, { borderLeftColor: on ? "rgba(255,255,255,0.15)" : colors.line }]}>
                {hearing(p.id) && !previewStatus.isLoaded ? (
                  <ActivityIndicator color={on ? colors.onDeep : colors.coralText} />
                ) : hearing(p.id) ? (
                  <View style={{ flexDirection: "row", gap: 3 }}>
                    <View style={[styles.pauseBar, { backgroundColor: on ? colors.onDeep : colors.coralText }]} />
                    <View style={[styles.pauseBar, { backgroundColor: on ? colors.onDeep : colors.coralText }]} />
                  </View>
                ) : (
                  <Icon name="play" size={18} color={on ? colors.onDeep : colors.coralText} />
                )}
              </Pressable>
            </View>
          );
        })}
      </View>
      {preset && changed ? <Txt variant="cap">The preview plays the original with the sound; your saved song gets both your levels and the sound.</Txt> : null}
      {error ? (
        <Banner
          kind="error"
          title={error.credits ? "Not enough credits" : undefined}
          text={error.text}
          action={error.credits ? <Button label="Get credits" small onPress={() => router.push("/credits")} /> : undefined}
        />
      ) : null}
      <Button label="Save mix · free" icon="check" block loading={busy} disabled={silent || (!changed && !preset)} onPress={save} />
      <Txt variant="cap" style={{ textAlign: "center" }}>
        Saved as a new song. The original stays as it is.
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 44 },
  well: { padding: 16, borderRadius: radius.lg, gap: 12 },
  stem: { borderRadius: 14, borderLeftWidth: 5, paddingLeft: 12, paddingRight: 8, paddingVertical: 6 },
  stemTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  ms: { width: 44, height: 44, borderRadius: radius.pill, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  level: { height: 44, justifyContent: "center" },
  track: { height: 10, borderRadius: 6, overflow: "hidden" },
  knob: { position: "absolute", width: 26, height: 26, marginLeft: -13, borderRadius: 13, borderWidth: 3, top: 9 },
  fx: { flexDirection: "row", borderWidth: 1.5, borderRadius: 16, overflow: "hidden" },
  fxPick: { flex: 1, minHeight: 60, paddingHorizontal: 14, paddingVertical: 10, justifyContent: "center", gap: 2 },
  fxHear: { width: 56, alignItems: "center", justifyContent: "center", borderLeftWidth: 1 },
  pauseBar: { width: 4, height: 16, borderRadius: 2 },
});
