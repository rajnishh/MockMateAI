import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, type ScrollViewInstance, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg";

import { Icon } from "@/components/icon";
import { SongCover } from "@/components/song-cover";
import { PauseGlyph, PlayGlyph, useSongAnalysis, useSongPlayer } from "@/components/song-player";
import { type BeatDrive, PlayerBackdrop, useBeatDrive } from "@/components/sparkle-dust";
import { Txt } from "@/components/ui";
import { WaveformScrubber } from "@/components/waveform-scrubber";
import { api, type Song, type SongAnalysis } from "@/lib/api";
import { PLAYER_THEMES, type PlayerTheme, usePlayerTheme } from "@/lib/player-themes";
import { genreLabel, shareSong } from "@/lib/songs";
import { useData } from "@/lib/use-data";
import { fonts } from "@/theme";

const INK = "#fff1e6";
const INK_MUTED = "rgba(255, 241, 230, 0.7)";

// The full-screen player: cover art glowing on the beat, sparkle dust, lyrics in time and a waveform to scrub.
export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const player = useSongPlayer();
  const fetched = useData(() => (player.song?.id === id ? Promise.resolve(player.song) : api.song(id)));
  const song = player.song?.id === id ? player.song : fetched.data;
  const analysis = useSongAnalysis(song?.status === "completed" ? id : null);
  const [theme, setTheme] = usePlayerTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  // Opening a song that isn't playing starts it.
  const started = useRef(false);
  useEffect(() => {
    if (!song || started.current || !song.audioUrl) return;
    started.current = true;
    if (player.current !== song.id) player.play(song);
  }, [song, player]);

  const mine = player.current === id;
  const time = mine ? player.status.currentTime : 0;
  const playing = mine && player.status.playing;
  const duration = (mine && player.status.duration > 0 ? player.status.duration : 0) || analysis?.duration || song?.durationSec || 0;
  const drive = useBeatDrive(analysis, { time, playing });

  const small = height < 700;
  const coverSize = Math.round(Math.min(width - (small ? 120 : 72), height * (small ? 0.27 : 0.34)));
  const top = insets.top + 56;
  const focusY = top + coverSize / 2 + 8;

  async function share() {
    if (!song) return;
    setSharing(true);
    setShareError(null);
    try {
      await shareSong(song);
    } catch (err) {
      setShareError((err as Error).message);
    } finally {
      setSharing(false);
    }
  }

  const close = () => (router.canGoBack() ? router.back() : router.replace("/songs"));

  return (
    <View style={{ flex: 1, backgroundColor: theme.sky[2] }}>
      <StatusBar style="light" />
      <PlayerBackdrop theme={theme} drive={drive} width={width} height={height} focusY={focusY} />
      <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12), paddingHorizontal: 20 }}>
        <View style={styles.top}>
          <RoundButton label="Close player" onPress={close}>
            <SvgXml xml={CHEVRON_DOWN} width={26} height={26} color={INK} />
          </RoundButton>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Txt variant="over" style={{ color: INK_MUTED, letterSpacing: 1.4 }}>
              NOW PLAYING
            </Txt>
            {song ? (
              <Txt variant="cap" numberOfLines={1} style={{ color: INK }}>
                {[genreLabel(song.genre), analysis?.bpm ? `${analysis.bpm} BPM` : null].filter(Boolean).join(" · ")}
              </Txt>
            ) : null}
          </View>
          <RoundButton label="Save or share song" onPress={share} disabled={!song?.audioUrl || sharing}>
            {sharing ? <ActivityIndicator color={INK} /> : <Icon name="share" size={22} color={INK} />}
          </RoundButton>
        </View>

        {!song ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
            {fetched.error ? (
              <Txt variant="body" style={{ color: INK, textAlign: "center" }}>
                {`Couldn't open this song. ${fetched.error}`}
              </Txt>
            ) : (
              <ActivityIndicator color={INK} />
            )}
          </View>
        ) : (
          <>
            <BeatCover song={song} size={coverSize} drive={drive} theme={theme} />
            <View style={{ alignItems: "center", marginTop: small ? 10 : 16, gap: 2 }}>
              <Txt variant={small ? "md" : "lg"} numberOfLines={2} accessibilityRole="header" style={{ color: INK, textAlign: "center" }}>
                {song.title}
              </Txt>
              {shareError ? (
                <Txt variant="cap" style={{ color: "#ff8b7e", textAlign: "center" }}>
                  {shareError}
                </Txt>
              ) : null}
            </View>
            <Lyrics song={song} analysis={analysis} time={time} onSeek={(s) => player.seekTo(s)} accent={theme.accent} />
            <WaveformScrubber peaks={analysis?.peaks ?? null} time={time} duration={duration} accent={theme.accent} onSeek={(s) => (mine ? player.seekTo(s) : player.play(song))} />
            <View style={[styles.controls, { marginVertical: small ? 4 : 12 }]}>
              <RoundButton label="Back 10 seconds" size={56} onPress={() => player.skip(-10)} disabled={!mine}>
                <SvgXml xml={skipXml(false)} width={34} height={34} color={INK} />
              </RoundButton>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={playing ? `Pause ${song.title}` : `Play ${song.title}`}
                onPress={() => player.toggle(song)}
                disabled={!song.audioUrl}
                style={({ pressed }) => [styles.play, { backgroundColor: theme.accent, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
                {mine && !player.status.isLoaded ? (
                  <ActivityIndicator color={theme.onAccent} />
                ) : playing ? (
                  <PauseGlyph color={theme.onAccent} size={26} />
                ) : (
                  <PlayGlyph color={theme.onAccent} size={32} />
                )}
              </Pressable>
              <RoundButton label="Forward 10 seconds" size={56} onPress={() => player.skip(10)} disabled={!mine}>
                <SvgXml xml={skipXml(true)} width={34} height={34} color={INK} />
              </RoundButton>
            </View>
            <ThemePicker value={theme} onChange={setTheme} />
          </>
        )}
      </View>
    </View>
  );
}

// The cover breathes with the loudness and kicks on the beat.
function BeatCover({ song, size, drive, theme }: { song: Song; size: number; drive: BeatDrive; theme: PlayerTheme }) {
  const style = useAnimatedStyle(() => ({ transform: [{ scale: drive.moving ? 1 + drive.energy.value * 0.025 + drive.pulse.value * 0.035 : 1 }] }));
  return (
    <Animated.View style={[{ alignSelf: "center", marginTop: 8, borderRadius: 22, backgroundColor: theme.sky[1], shadowColor: theme.glow, shadowOpacity: 0.55, shadowRadius: 28, shadowOffset: { width: 0, height: 10 } }, style]}>
      <SongCover song={song} size={size} radius={22} />
    </Animated.View>
  );
}

// Lyric lines, the sung one bright and kept in view. Tap a line to jump to it.
function Lyrics({ song, analysis, time, onSeek, accent }: { song: Song; analysis: SongAnalysis | null; time: number; onSeek: (sec: number) => void; accent: string }) {
  const scroll = useRef<ScrollViewInstance>(null);
  const ys = useRef<number[]>([]);
  const [boxH, setBoxH] = useState(0);
  const lines = analysis?.lines ?? [];
  let active = -1;
  for (let i = 0; i < lines.length; i++) if (lines[i].start <= time + 0.15) active = i;

  useEffect(() => {
    if (active < 0) return scroll.current?.scrollTo({ y: 0, animated: true });
    const y = ys.current[active];
    if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - boxH * 0.3), animated: true });
  }, [active, boxH]);

  if (!analysis) return <View style={{ flex: 1, minHeight: 64 }} />;
  if (!lines.length) {
    return (
      <View style={{ flex: 1, minHeight: 64, alignItems: "center", justifyContent: "center" }}>
        <Txt variant="label" style={{ color: INK_MUTED }}>
          {song.lyrics.trim() ? "" : "Instrumental"}
        </Txt>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, minHeight: 64, marginVertical: 10 }} onLayout={(e) => setBoxH(e.nativeEvent.layout.height)}>
      <ScrollView ref={scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: boxH * 0.3, gap: 10 }}>
        {lines.map((l, i) => {
          const now = i === active;
          return (
            <Pressable key={i} onPress={() => onSeek(l.start)} accessibilityRole="button" accessibilityHint="Plays from this line" onLayout={(e) => (ys.current[i] = e.nativeEvent.layout.y)}>
              <Txt
                variant="md"
                style={{
                  textAlign: "center",
                  fontSize: now ? 22 : 18,
                  lineHeight: now ? 30 : 25,
                  color: now ? INK : i < active ? "rgba(255, 241, 230, 0.38)" : "rgba(255, 241, 230, 0.6)",
                  textShadowColor: now ? accent : "transparent",
                  textShadowRadius: now ? 12 : 0,
                }}>
                {l.text}
              </Txt>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function ThemePicker({ value, onChange }: { value: PlayerTheme; onChange: (id: PlayerTheme["id"]) => void }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Player theme" style={styles.themes}>
      {PLAYER_THEMES.map((t) => {
        const on = t.id === value.id;
        return (
          <Pressable
            key={t.id}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${t.name}, ${t.hint}`}
            onPress={() => onChange(t.id)}
            style={styles.theme}>
            <View style={[styles.ring, { borderColor: on ? INK : "transparent" }]}>
              <View style={[styles.swatch, { backgroundColor: t.sky[0] }]}>
                <View style={[styles.dot, { backgroundColor: t.glow }]} />
              </View>
            </View>
            <Txt variant="cap" style={{ color: on ? INK : INK_MUTED, fontFamily: on ? fonts.bold : fonts.medium, fontSize: 12, lineHeight: 15 }}>
              {t.name}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

function RoundButton({ label, onPress, disabled, size = 44, children }: { label: string; onPress: () => void; disabled?: boolean; size?: number; children: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : pressed ? 0.6 : 1 })}>
      {children}
    </Pressable>
  );
}

const CHEVRON_DOWN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;

// A circular arrow with "10" inside, pointing back or forward.
function skipXml(forward: boolean): string {
  const arc = forward ? `<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 3.5v4h-4"/>` : `<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 3.5v4h4"/>`;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${arc}<text x="12" y="15.2" text-anchor="middle" font-size="7.5" font-weight="700" fill="currentColor" stroke="none" font-family="${fonts.bold}">10</text></svg>`;
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", gap: 8, height: 52 },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 28 },
  play: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  themes: { flexDirection: "row", justifyContent: "center", gap: 18 },
  theme: { alignItems: "center", gap: 3, minWidth: 56, minHeight: 44 },
  ring: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  swatch: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  dot: { width: 14, height: 14, borderRadius: 7, opacity: 0.95 },
});
