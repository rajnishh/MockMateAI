import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import { Icon } from "@/components/icon";
import { Banner, Button, Card, Empty, Header, Screen, Skeleton, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { currentTake, hum, KIND_LABEL, type Recording } from "@/lib/hum";
import { formatTime } from "@/lib/songs";
import { useData } from "@/lib/use-data";
import { radius, space, useTheme } from "@/theme";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function when(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours() % 12 || 12;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${h}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() < 12 ? "am" : "pm"}`;
}

// "My recordings": hums, songs and requests from the last 30 days. Play one, or pick it up again to make something.
export default function HumRecordings() {
  const { colors } = useTheme();
  const list = useData(() => hum.recordings());
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
  }, []);

  async function play(r: Recording) {
    if (playingId === r.id && status.playing) {
      player.pause();
      setPlayingId(null);
      return;
    }
    player.replace({ uri: hum.recordingUrl(r.id), headers: await api.videoHeaders() });
    player.play();
    setPlayingId(r.id);
  }

  async function open(r: Recording) {
    setOpening(r.id);
    setError(null);
    try {
      player.pause();
      setPlayingId(null);
      const [take, file] = await Promise.all([hum.recording(r.id), r.video ? Promise.resolve({ uri: "", name: "clip", type: "video/mp4" }) : hum.download(r.id)]);
      currentTake.set(take, file);
      router.push("/hum/confirm");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setOpening(null);
    }
  }

  function remove(r: Recording) {
    Alert.alert("Delete this recording?", "It can't be brought back. Songs you made from it stay.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (playingId === r.id) {
            player.pause();
            setPlayingId(null);
          }
          try {
            await hum.removeRecording(r.id);
            list.reload();
          } catch (err) {
            setError((err as Error).message);
          }
        },
      },
    ]);
  }

  const takes = list.data ?? [];
  return (
    <Screen>
      <Header title="My recordings" sub="Hum it" back />
      {error || list.error ? <Banner kind="error" text={error ?? list.error!} /> : null}
      {list.loading && !list.data ? (
        <Skeleton height={240} />
      ) : takes.length === 0 ? (
        <Empty title="No recordings yet" text="Everything you hum, sing or say in Hum it is kept here for 30 days." action={<Button label="Record" icon="mic" onPress={() => router.back()} />} />
      ) : (
        <>
          <Txt variant="cap">Kept for 30 days. Tap one to make a song from it again.</Txt>
          {takes.map((r) => {
            const playing = playingId === r.id && status.playing;
            const name = r.title || (r.kind === "hum" ? "My tune" : r.transcript.split(/\s+/).slice(0, 5).join(" ") || KIND_LABEL[r.kind]);
            return (
              <Card key={r.id} onPress={() => open(r)} style={styles.card}>
                <View style={styles.row}>
                  {r.video ? (
                    <View style={[styles.play, { backgroundColor: colors.surfaceSunken }]}>
                      <Icon name="film" size={20} color={colors.ink} />
                    </View>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={playing ? `Pause ${name}` : `Play ${name}`}
                      hitSlop={6}
                      onPress={() => play(r)}
                      style={[styles.play, { backgroundColor: colors.deep }]}>
                      <Icon name={playing ? "stop" : "play"} size={20} color={colors.onDeep} />
                    </Pressable>
                  )}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt variant="label" numberOfLines={1}>
                      {name}
                    </Txt>
                    {r.transcript ? (
                      <Txt variant="body" numberOfLines={2}>
                        {r.transcript}
                      </Txt>
                    ) : null}
                    <Txt variant="cap">{`${KIND_LABEL[r.kind]} · ${formatTime(Math.round(r.durationSec))} · ${when(r.createdAt)}`}</Txt>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${name}`} hitSlop={8} onPress={() => remove(r)} style={styles.trash}>
                    <Icon name="trash" size={20} color={colors.inkMuted} />
                  </Pressable>
                </View>
                {opening === r.id ? <Txt variant="cap">Opening…</Txt> : null}
              </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[2] },
  row: { flexDirection: "row", alignItems: "center", gap: space[3] },
  play: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  trash: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
