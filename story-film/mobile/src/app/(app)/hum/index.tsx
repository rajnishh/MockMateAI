import * as DocumentPicker from "expo-document-picker";
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from "expo-audio";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Linking, Modal, Pressable, StyleSheet, View } from "react-native";

import { DuetAudio } from "@/components/duet-audio";
import { Icon } from "@/components/icon";
import { ReelLogo, useReducedMotion } from "@/components/logo";
import { Banner, Button, Chip, Credits, Header, Hero, Row, Screen, Txt } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { allowDeviceSpeech, transcribeOnDevice } from "@/lib/device-speech";
import { duetPart } from "@/lib/duets";
import { occasionLabel, replyContext } from "@/lib/gifts";
import { currentTake, hum, level, type Picked } from "@/lib/hum";
import { useSession } from "@/lib/session";
import { formatTime } from "@/lib/songs";
import { getItem, setItem } from "@/lib/storage";
import { useData } from "@/lib/use-data";
import { radius, space, useTheme } from "@/theme";

const MAX_SEC = 60;
const MIN_SEC = 2;
const BARS = 24;
const HINT_KEY = "hum.hintDismissed";

type Phase = "idle" | "recording" | "review" | "sending" | "error" | "denied";
type Sheet = "mic" | "camera" | "siri" | null;

// "Hum it": one big mic. Hum a tune, sing a few lines or say what you want; Reelkar works out which.
export default function HumRecord() {
  const { colors } = useTheme();
  const { prefs } = useSession();
  const reduced = useReducedMotion();
  const billing = useData(() => api.billing());
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, isMeteringEnabled: true });
  const [phase, setPhase] = useState<Phase>("idle");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [file, setFile] = useState<(Picked & { sec: number; video: boolean }) | null>(null);
  const [sec, setSec] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const [error, setError] = useState<{ text: string; credits?: boolean } | null>(null);
  const [step, setStep] = useState("");
  const [hint, setHint] = useState(false);
  const warned = useRef(false);
  const stopRef = useRef<() => void>(() => undefined);
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const playing = useAudioPlayerStatus(player).playing;
  const language = prefs?.language ?? "hi";
  // A reply to a gift lasts while this screen is open; leaving Hum it drops it.
  const [reply] = useState(() => replyContext.get());
  // Or a Jugalbandi part: the take goes to the duet instead of "Here's what I heard".
  const [part] = useState(() => duetPart.get());
  // The partner's part plays while you sing (best with earphones), so you can answer it in time.
  const theirs = useAudioPlayer(null);
  const [playAlong, setPlayAlong] = useState(true);
  useEffect(() => {
    if (!part?.otherPart) return;
    api.videoHeaders().then((headers) => theirs.replace({ uri: api.duetAudioUrl(part.otherPart!), headers })).catch(() => undefined);
  }, [part, theirs]);
  useEffect(
    () => () => {
      replyContext.clear();
      duetPart.clear();
    },
    [],
  );

  useEffect(() => {
    getItem(HINT_KEY).then((v) => setHint(v !== "1")).catch(() => setHint(true));
    getRecordingPermissionsAsync()
      .then((p) => !p.granted && !p.canAskAgain && setPhase("denied"))
      .catch(() => undefined);
  }, []);

  // The meter scrolls with the newest level on the right; the timer and the auto-stop follow the recorder.
  useEffect(() => {
    if (phase !== "recording") return;
    const timer = setInterval(() => {
      const st = recorder.getStatus();
      const now = st.durationMillis / 1000;
      setSec(now);
      setLevels((l) => [...l.slice(1), level(st.metering)]);
      if (now >= MAX_SEC - 10 && !warned.current) {
        warned.current = true;
        Haptics.selectionAsync().catch(() => undefined);
      }
      if (now >= MAX_SEC) {
        clearInterval(timer);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
        stopRef.current();
      }
    }, 66);
    return () => clearInterval(timer);
  }, [phase, recorder]);

  async function start() {
    setError(null);
    const perm = await getRecordingPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) return setPhase("denied");
      return setSheet("mic");
    }
    player.pause();
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    if (part?.otherPart && playAlong) {
      theirs.seekTo(0).catch(() => undefined);
      theirs.play();
    }
    warned.current = false;
    setSec(0);
    setLevels(Array(BARS).fill(0));
    setPhase("recording");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    AccessibilityInfo.announceForAccessibility("Recording");
  }

  async function stop() {
    const length = recorder.getStatus().durationMillis / 1000;
    await recorder.stop();
    theirs.pause();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    const uri = recorder.uri;
    if (!uri || length < MIN_SEC) {
      setPhase("idle");
      setError({ text: "That was too short. Hum or talk for at least 3 seconds." });
      return;
    }
    setFile({ uri, name: "take.m4a", type: "audio/m4a", sec: length, video: false });
    player.replace({ uri });
    setPhase("review");
    AccessibilityInfo.announceForAccessibility(`Stopped. ${Math.round(length)} seconds`);
  }

  useEffect(() => {
    stopRef.current = stop;
  });

  async function allowMic() {
    setSheet(null);
    const p = await requestRecordingPermissionsAsync();
    if (!p.granted) return setPhase("denied");
    // Optional: lets the phone understand speech before anything is sent.
    await allowDeviceSpeech();
    setPhase("idle");
    start();
  }

  async function filmYourself() {
    setSheet(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError({ text: "Turn on Camera for Reelkar in Settings to film yourself." });
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["videos"], videoMaxDuration: MAX_SEC, cameraType: ImagePicker.CameraType.front, quality: 1 });
    const a = res.canceled ? null : res.assets[0];
    if (a) pick({ uri: a.uri, name: a.fileName ?? "clip.mov", type: a.mimeType ?? "video/quicktime", sec: (a.duration ?? 0) / 1000, video: true });
  }

  async function filmPressed() {
    const perm = await ImagePicker.getCameraPermissionsAsync();
    if (perm.granted) return filmYourself();
    if (!perm.canAskAgain) return setError({ text: "Turn on Camera for Reelkar in Settings to film yourself." });
    setSheet("camera");
  }

  async function importFile() {
    const res = await DocumentPicker.getDocumentAsync({ type: ["audio/*", "video/*"], copyToCacheDirectory: true });
    const a = res.canceled ? null : res.assets[0];
    if (!a) return;
    if ((a.size ?? 0) > 100 * 1024 * 1024) return setError({ text: "That file is too large. Pick one under 100 MB." });
    const type = a.mimeType ?? (/\.(mp4|mov)$/i.test(a.name) ? "video/mp4" : "audio/mpeg");
    pick({ uri: a.uri, name: a.name, type, sec: 0, video: type.startsWith("video/") });
  }

  function pick(f: Picked & { sec: number; video: boolean }) {
    setError(null);
    setFile(f);
    if (!f.video) player.replace({ uri: f.uri });
    setPhase("review");
  }

  async function useThis() {
    if (!file) return;
    player.pause();
    setPhase("sending");
    setError(null);
    try {
      // The phone's own speech recognition first (free); the server listens again if it heard little.
      setStep("Listening closely…");
      const transcript = file.video ? "" : await transcribeOnDevice(file.uri, language);
      setStep("Working out if you hummed, sang or asked");
      const take = await hum.upload(file, { transcript, language });
      if (part) {
        setStep("Sending your part");
        await api.duetPart(part.id, take.takeId);
        duetPart.clear();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        router.back();
        return;
      }
      currentTake.set(take, file);
      Haptics.selectionAsync().catch(() => undefined);
      AccessibilityInfo.announceForAccessibility(`I heard ${take.kind === "speech" ? "you asking" : take.kind === "sing" ? "singing" : "humming"}`);
      setPhase("review");
      router.push("/hum/confirm");
    } catch (err) {
      console.warn("Hum it upload failed:", (err as Error).message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      setError({ text: err instanceof ApiError ? err.message : "Couldn't send that. Check your internet. Your recording is safe.", credits: err instanceof ApiError && err.needCredits });
      setPhase("error");
    }
  }

  function again() {
    player.pause();
    setFile(null);
    setError(null);
    setPhase("idle");
  }

  const recording = phase === "recording";
  const reviewing = phase === "review" || phase === "error";
  const headline =
    phase === "recording" ? "Listening…" : phase === "sending" ? "Sending…" : reviewing ? `Got it${file?.sec ? ` · ${formatTime(file.sec)}` : ""}` : phase === "denied" ? "Reelkar can't hear you" : "Hum, sing or just say it";
  const helper =
    phase === "recording"
      ? sec >= MAX_SEC - 10
        ? `${Math.ceil(MAX_SEC - sec)} s left`
        : "Up to 1 minute"
      : phase === "sending"
        ? step
        : reviewing
          ? file?.video
            ? "Your clip is ready. Use it, or film again."
            : "Play it back, or use it"
          : phase === "denied"
            ? "Turn on Microphone for Reelkar in Settings."
            : "“A Punjabi wedding song about my sister”";

  return (
    <Screen
      footer={
        reviewing ? (
          <>
            <Button label="Use this" icon="sparkle" block onPress={useThis} />
            <Button label={file?.video ? "Choose again" : "Record again"} kind="ghost" icon="refresh" block onPress={again} />
          </>
        ) : (
          <Txt variant="cap" style={{ textAlign: "center" }}>
            2 credits for a song on your tune · you&apos;ll see the price before anything is made
          </Txt>
        )
      }>
      <Header title="Hum it" sub="Make" back right={<Credits count={billing.data?.balance ?? null} />} />
      {part ? (
        <Banner
          kind="info"
          title={part.otherPart ? `Your part · answer ${part.otherName}` : "Your part of the Jugalbandi"}
          text="About 30 seconds. Hum, sing or just say your lines; AI joins both parts into one song."
          action={part.otherPart ? <DuetAudio path={part.otherPart} label={`${part.otherName}'s part`} /> : undefined}
        />
      ) : null}
      {part?.otherPart ? (
        <Chip label={`Play ${part.otherName}'s part while I sing (earphones)`} selected={playAlong} onPress={() => setPlayAlong(!playAlong)} />
      ) : null}
      {reply ? (
        <Banner kind="info" title={`Replying to ${reply.toName}`} text={`Hum, sing or just say what the song back for their ${occasionLabel(reply.occasion).toLowerCase()} gift should be.`} />
      ) : null}
      {error ? (
        <Banner
          kind="error"
          text={error.text}
          action={phase === "error" ? <Button label="Try again" small onPress={useThis} /> : error.credits ? <Button label="Get credits" small onPress={() => router.push("/credits")} /> : undefined}
        />
      ) : null}

      <Hero>
        <View style={{ gap: 4, paddingTop: space[2] }}>
          <Txt variant="lg" color="onBrand">
            {headline}
          </Txt>
          <Txt variant="body" color="onBrandMuted">
            {helper}
          </Txt>
        </View>

        <View style={styles.meter} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {levels.map((l, i) => (
            <View
              key={i}
              style={[
                styles.bar,
                { height: reduced ? 8 + 40 * levels[BARS - 1] : 8 + 40 * l, backgroundColor: recording || reviewing ? colors.deep : colors.heroRing, opacity: recording || l > 0 ? 1 : 0.6 },
              ]}
            />
          ))}
        </View>
        {recording ? (
          <Txt variant="mono" color="onBrand" style={{ fontSize: 20, lineHeight: 26, textAlign: "center" }}>
            {`${formatTime(sec)} / ${formatTime(MAX_SEC)}`}
          </Txt>
        ) : null}

        <View style={styles.micWrap}>
          {phase === "sending" ? (
            <ReelLogo size={72} loop />
          ) : reviewing && file ? (
            file.video ? (
              <View style={[styles.clip, { backgroundColor: colors.deep }]}>
                <Icon name="film" size={36} color={colors.onDeep} />
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={playing ? "Pause your recording" : "Play your recording"}
                onPress={() => (playing ? player.pause() : (player.currentTime >= player.duration - 0.25 && player.seekTo(0), player.play()))}
                style={[styles.play, { backgroundColor: colors.deep }]}>
                <Icon name={playing ? "stop" : "play"} size={26} color={colors.onDeep} />
              </Pressable>
            )
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={recording ? `Stop recording, ${Math.round(sec)} seconds` : "Record. Hum, sing or say what you want"}
              accessibilityHint="Records up to 1 minute"
              disabled={phase === "denied"}
              onPress={recording ? stop : start}
              style={({ pressed }) => [styles.mic, { backgroundColor: colors.deep, opacity: phase === "denied" ? 0.4 : 1, transform: [{ translateY: pressed ? 2 : 0 }] }]}>
              <Icon name={recording ? "stop" : phase === "denied" ? "lock" : "mic"} size={44} color={colors.onDeep} />
            </Pressable>
          )}
          <Txt variant="label" color="onBrand">
            {phase === "sending" ? "" : reviewing ? (file?.video ? file.name : playing ? "Playing" : "Tap to play") : recording ? "Tap to stop" : phase === "denied" ? "Microphone is off" : "Tap to start"}
          </Txt>
        </View>
        {phase === "denied" ? <Button label="Open Settings" block onPress={() => Linking.openSettings()} /> : null}
      </Hero>

      {phase === "idle" || phase === "denied" ? (
        <Row>
          <Button label="Film yourself" kind="secondary" small icon="camera" onPress={filmPressed} style={{ flex: 1 }} />
          <Button label="Import a file" kind="secondary" small icon="download" onPress={importFile} style={{ flex: 1 }} />
        </Row>
      ) : null}

      {hint && phase === "idle" ? (
        <Banner
          kind="info"
          title="Say it to Siri"
          text="“Hey Siri, make with Reelkar”, or send it from Gemini or any app with the Shortcuts app."
          action={
            <View style={{ alignItems: "flex-end" }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Hide this tip" hitSlop={10} onPress={() => (setHint(false), setItem(HINT_KEY, "1"))} style={styles.close}>
                <Txt variant="label">✕</Txt>
              </Pressable>
              <Button label="Show me" kind="ghost" small onPress={() => setSheet("siri")} />
            </View>
          }
        />
      ) : null}

      <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <Pressable style={[styles.scrim, { backgroundColor: colors.scrim }]} onPress={() => setSheet(null)} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: colors.surfaceRaised }]}>
          {sheet === "mic" ? (
            <>
              <Txt variant="md">Let Reelkar hear you</Txt>
              <Txt>
                Reelkar uses the microphone only while you record. Your phone works out what you said first; if it can&apos;t, the recording goes to Reelkar to understand it.
              </Txt>
              <Button label="Allow microphone" icon="mic" block onPress={allowMic} />
              <Button label="Not now" kind="ghost" block onPress={() => setSheet(null)} />
            </>
          ) : sheet === "camera" ? (
            <>
              <Txt variant="md">Let Reelkar film you</Txt>
              <Txt>Used only when you tap Film yourself. Nothing records in the background.</Txt>
              <Button label="Allow camera" icon="camera" block onPress={filmYourself} />
              <Button label="Not now" kind="ghost" block onPress={() => setSheet(null)} />
            </>
          ) : (
            <>
              <Txt variant="md">Start from anywhere</Txt>
              <Txt>• Say “Hey Siri, make with Reelkar”, then tell Siri what to make. Reelkar opens with it filled in.</Txt>
              <Txt>• In the Shortcuts app, Reelkar&apos;s “Make with Reelkar” action takes text from any app, Gemini too.</Txt>
              <Txt>• Any app can open reelkar://create?prompt=your idea</Txt>
              <Txt variant="cap">Nothing is made until you check it and tap Make it.</Txt>
              <Button label="Got it" block onPress={() => setSheet(null)} />
            </>
          )}
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  meter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, height: 56, marginTop: space[3] },
  bar: { width: 4, borderRadius: radius.pill },
  micWrap: { alignItems: "center", gap: space[2], paddingVertical: space[4] },
  mic: { width: 112, height: 112, borderRadius: 56, alignItems: "center", justifyContent: "center", borderBottomWidth: 4, borderBottomColor: "rgba(0,0,0,0.3)" },
  play: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  clip: { width: 72, height: 96, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  close: { width: 48, height: 32, alignItems: "flex-end", justifyContent: "center" },
  scrim: { flex: 1 },
  sheet: { padding: space[5], gap: space[3], borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: space[7] },
});
