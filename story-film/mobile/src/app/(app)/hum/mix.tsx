import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";

import { Icon } from "@/components/icon";
import { Stepper } from "@/components/stepper";
import { Banner, Button, Card, Header, ProgressBar, Screen, Txt } from "@/components/ui";
import { api, type Song } from "@/lib/api";
import { currentTake, hum, setVolume } from "@/lib/hum";
import { formatTime } from "@/lib/songs";
import { useTheme } from "@/theme";

const pct = (n: number) => `${Math.round(n * 100)} %`;
const fine = (n: number) => `${formatTime(Math.floor(n))}${n % 1 ? ".5" : ""}`;

// Mix: your take with the AI song. Trim, fades, and the levels of your voice and the music; Save makes a new copy.
export default function HumMix() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ song?: string; take: string }>();
  const saved = currentTake.get();
  const take = saved?.take.takeId === params.take ? saved : null;
  const isVideo = Boolean(take?.take.video);
  const tune = take?.take.kind !== "speech";
  const [song, setSong] = useState<Song | null>(null);
  const length = Math.max(take?.take.durationSec ?? 0, isVideo ? 0 : (song?.durationSec ?? 0));
  const [startSec, setStartSec] = useState(0);
  const [endChoice, setEndSec] = useState<number | null>(null);
  const endSec = endChoice ?? Math.round(length * 2) / 2;
  const [fadeInSec, setFadeInSec] = useState(0);
  const [fadeOutSec, setFadeOutSec] = useState(2);
  // A hum under the band sounds best low; sung lines a bit louder; a clip keeps its sound.
  const [voice, setVoice] = useState(isVideo ? 1 : take?.take.kind === "sing" ? 0.6 : 0.3);
  const [music, setMusic] = useState(isVideo ? 0.6 : 1);
  const [replace, setReplace] = useState(false);
  const lastVoice = useRef(voice);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const voicePlayer = useAudioPlayer(take && !isVideo ? { uri: take.file.uri } : null, { updateInterval: 200 });
  const songPlayer = useAudioPlayer(null, { updateInterval: 200 });
  const status = useAudioPlayerStatus(songPlayer);
  const voiceStatus = useAudioPlayerStatus(voicePlayer);
  const playing = status.playing || voiceStatus.playing;
  const at = song ? status.currentTime : voiceStatus.currentTime;

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
    if (!params.song) return;
    api
      .song(params.song)
      .then(async (s) => {
        setSong(s);
        const uri = api.songAudioUrl(s);
        if (uri) songPlayer.replace({ uri, headers: await api.videoHeaders() });
      })
      .catch((err) => setError((err as Error).message));
  }, [params.song, songPlayer]);

  // The preview applies the levels live and plays only the trimmed part (fades are heard after Save).
  function levels(v: { voice?: number; music?: number; replace?: boolean }) {
    const off = v.replace ?? replace;
    setVolume(voicePlayer, off ? 0 : Math.min(1, v.voice ?? voice));
    setVolume(songPlayer, Math.min(1, v.music ?? music));
  }
  useEffect(() => {
    if (playing && at >= endSec && endSec > 0) {
      voicePlayer.pause();
      songPlayer.pause();
    }
  }, [at, endSec, playing, voicePlayer, songPlayer]);

  async function preview() {
    if (playing) {
      voicePlayer.pause();
      songPlayer.pause();
      return;
    }
    await Promise.all([voicePlayer.seekTo(startSec), song ? songPlayer.seekTo(startSec) : Promise.resolve()]);
    levels({});
    if (!isVideo) voicePlayer.play();
    if (song) songPlayer.play();
  }

  function toggleReplace(on: boolean) {
    Haptics.selectionAsync().catch(() => undefined);
    if (on) lastVoice.current = voice;
    else setVoice(lastVoice.current || 0.6);
    setReplace(on);
    levels({ replace: on, voice: on ? 0 : lastVoice.current || 0.6 });
  }

  async function save() {
    if (!take) return;
    setSaving(true);
    setError(null);
    voicePlayer.pause();
    songPlayer.pause();
    try {
      const out = await hum.mix({
        takeId: take.take.takeId,
        songId: song?.id,
        startSec,
        endSec: endSec < length ? endSec : undefined,
        fadeInSec,
        fadeOutSec,
        voiceVolume: replace ? 0 : voice,
        musicVolume: music,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      if (out.film) router.replace(`/reel/${out.film.id}`);
      else if (out.song) router.replace(`/songs/${out.song.id}`);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      setError(`Couldn't save the mix. ${(err as Error).message}`);
      setSaving(false);
    }
  }

  if (!take) {
    return (
      <Screen>
        <Header title="Mix" back />
        <Banner kind="warn" text="Your recording isn't on this screen any more. Record it again to mix it." action={<Button label="Record" small onPress={() => router.dismissTo("/hum")} />} />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          <Button label="Save" icon="check" block loading={saving} disabled={!length || (params.song && !song) || false} onPress={save} />
          <Txt variant="cap" style={{ textAlign: "center" }}>
            {isVideo ? "Free · saves a video with the AI song under your clip" : "Free · saves a new copy, keeps the original"}
          </Txt>
        </>
      }>
      <Header title="Mix" sub={song?.title} back />
      <Card>
        <View style={styles.preview}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={playing ? "Pause the preview" : "Play the preview"}
            onPress={preview}
            disabled={isVideo && !song}
            style={[styles.play, { backgroundColor: colors.deep }]}>
            <Icon name={playing ? "stop" : "play"} size={22} color={colors.onDeep} />
          </Pressable>
          <View style={{ flex: 1, gap: 6 }}>
            <ProgressBar value={endSec > startSec ? (at - startSec) / (endSec - startSec) : 0} />
            <Txt variant="mono" color="inkMuted">{`${formatTime(at)} / ${formatTime(endSec)}`}</Txt>
          </View>
        </View>
        {isVideo ? <Txt variant="cap">The preview plays the song; your clip&apos;s own sound is mixed in when you save.</Txt> : null}
      </Card>

      <Card>
        <Stepper label="Start" value={startSec} onChange={setStartSec} min={0} max={Math.max(0, endSec - 1)} step={0.5} format={fine} />
        <Stepper label="End" value={endSec} onChange={setEndSec} min={startSec + 1} max={Math.max(startSec + 1, Math.round(length * 2) / 2)} step={0.5} format={fine} />
        <Stepper label="Fade in" value={fadeInSec} onChange={setFadeInSec} min={0} max={10} step={0.5} />
        <Stepper label="Fade out" value={fadeOutSec} onChange={setFadeOutSec} min={0} max={10} step={0.5} />
        <Stepper label="Your voice" value={replace ? 0 : voice} onChange={(v) => (setVoice(v), levels({ voice: v }))} min={0} max={1} step={0.1} format={pct} disabled={replace} />
        {song ? <Stepper label="AI music" value={music} onChange={(v) => (setMusic(v), levels({ music: v }))} min={0} max={1} step={0.1} format={pct} /> : null}
        {song && tune ? (
          <View style={styles.switchRow}>
            <Txt variant="label" style={{ flex: 1 }}>
              Replace my voice with the AI song
            </Txt>
            <Switch
              accessibilityLabel="Replace my voice with the AI song"
              value={replace}
              onValueChange={toggleReplace}
              trackColor={{ true: colors.tealText, false: colors.lineStrong }}
            />
          </View>
        ) : null}
      </Card>
      {error ? <Banner kind="error" text={error} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { flexDirection: "row", alignItems: "center", gap: 12 },
  play: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 },
});
