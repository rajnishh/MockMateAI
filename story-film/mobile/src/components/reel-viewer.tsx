import { useEvent } from "expo";
import { router } from "expo-router";
import { useVideoPlayer, type VideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { GestureDetector, GestureHandlerRootView, useExclusiveGestures, useLongPressGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from "react-native-gesture-handler";
import Animated, { FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

import { api, type Film } from "@/lib/api";
import { formatLabel } from "@/lib/formats";
import { saveReelToPhotos, shareReel } from "@/lib/reel-file";
import { getItem, setItem } from "@/lib/storage";
import { fonts } from "@/theme";
import { Icon } from "./icon";
import { confirmDelete } from "./reel-grid";
import { ReelThumb } from "./reel-thumb";
import { PauseGlyph, PlayGlyph } from "./song-player";
import { ListRow, Sheet, Txt } from "./ui";

const MUTED_KEY = "viewer.muted";
const WHITE = "#ffffff";
const SCRIM = "rgba(21,10,26,0.55)";
const TEAL = "#2ee6b8";

export type Fit = "cover" | "contain";

// Players are changed, not replaced, so these live outside the hooks (as in edit-preview.tsx).
function playOnly(player: VideoPlayer, playing: boolean, rewind: boolean) {
  if (playing) return player.play();
  player.pause();
  if (rewind) player.currentTime = 0;
}
function setMutedOn(player: VideoPlayer, muted: boolean) {
  player.muted = muted;
}

// Full-screen reels, one per page (design/home-v3/spec.md §3): swipe up or down for the next, tap
// to pause, hold to look, double-tap to fit or fill, pinch to zoom (it springs back). Mute is
// remembered. VoiceOver gets the same as actions: swipe up or down on the reel for next and
// previous, plus pause, mute, fit and share.
export function ReelViewer({ films: initial, startId, onSound }: { films: Film[]; startId: string; onSound: (on: boolean) => void }) {
  const { height, width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const list = useRef<FlatList<Film>>(null);
  const [films, setFilms] = useState(initial);
  const [start] = useState(() => Math.max(0, initial.findIndex((f) => f.id === startId)));
  const [active, setActiveIndex] = useState(start);
  // Pausing is for the reel on screen; the next one you swipe to plays.
  const [paused, setPaused] = useState(false);
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  const [muted, setMutedState] = useState<boolean | null>(null);
  const [fit, setFit] = useState<Fit>("cover");
  const [zoomed, setZoomed] = useState(false);
  const [more, setMore] = useState<Film | null>(null);

  useEffect(() => {
    api.videoHeaders().then(setHeaders);
    getItem(MUTED_KEY).then(
      (v) => setMutedState(v === "1"),
      () => setMutedState(false),
    );
  }, []);
  // With sound on the song player stops; muted, your Loop keeps playing under the reel.
  useEffect(() => {
    if (muted !== null) onSound(!muted);
  }, [muted, onSound]);

  const setMuted = (m: boolean) => {
    setMutedState(m);
    setItem(MUTED_KEY, m ? "1" : "0").catch(() => undefined);
  };

  // FlatList wants the same function every render.
  const [onViewable] = useState(() => ({ viewableItems }: { viewableItems: { index?: number | null }[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) {
      setActiveIndex(first.index);
      setPaused(false);
    }
  });

  const go = (index: number) => {
    if (index < 0 || index >= films.length) return;
    // With Reduce Motion, VoiceOver's next and previous jump instead of sliding.
    list.current?.scrollToIndex({ index, animated: !reduced });
    setActiveIndex(index);
    setPaused(false);
    AccessibilityInfo.announceForAccessibility(`Reel ${index + 1} of ${films.length}`);
  };

  const removed = (id: string) => {
    const rest = films.filter((f) => f.id !== id);
    if (!rest.length) return router.back();
    setFilms(rest);
    setActiveIndex(Math.min(active, rest.length - 1));
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <FlatList
        ref={list}
        data={films}
        keyExtractor={(f) => f.id}
        pagingEnabled
        scrollEnabled={!zoomed && films.length > 1}
        bounces={!reduced}
        showsVerticalScrollIndicator={false}
        initialScrollIndex={start}
        getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        decelerationRate="fast"
        renderItem={({ item, index }) => (
          <View style={{ height, width }}>
            {/* At most two players: the reel on screen, and the next one waiting, paused. */}
            {headers && muted !== null && (index === active || index === active + 1) ? (
              <ReelPage
                film={item}
                headers={headers}
                active={index === active}
                paused={index === active && paused}
                onPause={setPaused}
                muted={muted}
                fit={fit}
                position={`${index + 1} of ${films.length}`}
                onMute={() => setMuted(!muted)}
                onFit={() => setFit(fit === "cover" ? "contain" : "cover")}
                onZoom={setZoomed}
                onNext={() => go(index + 1)}
                onPrevious={() => go(index - 1)}
                onMore={() => setMore(item)}
              />
            ) : (
              <View style={styles.page}>
                <ReelThumb seed={index} />
              </View>
            )}
          </View>
        )}
      />
      {more ? <MoreSheet film={more} fit={fit} onFit={() => setFit(fit === "cover" ? "contain" : "cover")} onClose={() => setMore(null)} onDeleted={removed} /> : null}
    </GestureHandlerRootView>
  );
}

type PageProps = {
  film: Film;
  headers: Record<string, string>;
  active: boolean;
  paused: boolean;
  onPause: (paused: boolean) => void;
  muted: boolean;
  fit: Fit;
  position: string;
  onMute: () => void;
  onFit: () => void;
  onZoom: (zoomed: boolean) => void;
  onNext: () => void;
  onPrevious: () => void;
  onMore: () => void;
};

function ReelPage({ film, headers, active, paused, onPause, muted, fit, position, onMute, onFit, onZoom, onNext, onPrevious, onMore }: PageProps) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const url = api.videoUrl(film);
  const player = useVideoPlayer(url ? { uri: url, headers } : null, (p) => {
    p.loop = true;
    p.timeUpdateEventInterval = 0.25;
  });
  const { currentTime } = useEvent(player, "timeUpdate", { currentTime: 0, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: 0 });
  const { status } = useEvent(player, "statusChange", { status: player.status });
  // The play or pause sign that shows for a moment after a tap, and "Fit to screen" after a double tap.
  const [flash, setFlash] = useState<"play" | "pause" | null>(null);
  const [fitNote, setFitNote] = useState<string | null>(null);
  // Holding: paused, with the buttons out of the way.
  const [holding, setHolding] = useState(false);
  const [sharing, setSharing] = useState(false);
  const timers = useRef<{ flash?: ReturnType<typeof setTimeout>; fit?: ReturnType<typeof setTimeout> }>({});

  // Only the reel on screen plays; one you swipe away starts again from the top next time.
  useEffect(() => playOnly(player, active && !paused && !holding, !active), [active, paused, holding, player]);
  useEffect(() => setMutedOn(player, muted), [muted, player]);
  useEffect(() => {
    const t = timers.current;
    return () => {
      clearTimeout(t.flash);
      clearTimeout(t.fit);
    };
  }, []);

  const toggle = useCallback(() => {
    const next = !paused;
    onPause(next);
    setFlash(next ? "pause" : "play");
    clearTimeout(timers.current.flash);
    timers.current.flash = setTimeout(() => setFlash(null), 700);
    AccessibilityInfo.announceForAccessibility(next ? "Paused" : "Playing");
  }, [paused, onPause]);

  const fitToggle = useCallback(() => {
    onFit();
    setFitNote(fit === "cover" ? "Fit to screen" : "Fill screen");
    clearTimeout(timers.current.fit);
    timers.current.fit = setTimeout(() => setFitNote(null), 1000);
  }, [fit, onFit]);

  async function share() {
    setSharing(true);
    try {
      await shareReel(film.id, film.title);
    } catch (err) {
      Alert.alert("Couldn't share", (err as Error).message);
    } finally {
      setSharing(false);
    }
  }

  // Pinch zooms around the middle and springs back when you let go; paging waits meanwhile.
  const scale = useSharedValue(1);
  const pinch = usePinchGesture({
    onActivate: () => {
      scheduleOnRN(onZoom, true);
    },
    onUpdate: (e) => {
      scale.value = Math.min(4, Math.max(1, e.scale));
    },
    onDeactivate: () => {
      scale.value = reduced ? 1 : withSpring(1, { damping: 20 });
      scheduleOnRN(onZoom, false);
    },
  });
  const doubleTap = useTapGesture({ numberOfTaps: 2, maxDuration: 250, runOnJS: true, onActivate: fitToggle });
  const singleTap = useTapGesture({ maxDuration: 250, runOnJS: true, onActivate: toggle });
  const hold = useLongPressGesture({ minDuration: 300, runOnJS: true, onActivate: () => setHolding(true), onFinalize: () => setHolding(false) });
  const gestures = useSimultaneousGestures(pinch, useExclusiveGestures(doubleTap, singleTap, hold));
  const zoom = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const duration = player.duration || 0;
  const progress = duration ? Math.min(1, currentTime / duration) : 0;
  const title = film.title ?? "Your reel";
  const length = duration ? `${Math.floor(duration / 60)}:${String(Math.round(duration % 60)).padStart(2, "0")}` : null;
  const meta = [length, formatLabel(film.format), "Made with AI"].filter(Boolean).join(" · ");

  return (
    <View style={styles.page}>
      <GestureDetector gesture={gestures}>
        <Animated.View
          style={[StyleSheet.absoluteFill, zoom]}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${title}, reel ${position}`}
          accessibilityValue={{ text: `${paused ? "Paused" : "Playing"}${muted ? ", muted" : ""}` }}
          accessibilityHint="Swipe up or down for another reel. Double-tap to pause or play."
          accessibilityActions={[
            { name: "activate", label: paused ? "Play" : "Pause" },
            { name: "magicTap", label: paused ? "Play" : "Pause" },
            { name: "escape", label: "Close" },
            { name: "increment", label: "Next reel" },
            { name: "decrement", label: "Previous reel" },
            { name: "mute", label: muted ? "Unmute" : "Mute" },
            { name: "fit", label: fit === "cover" ? "Fit to screen" : "Fill screen" },
            { name: "share", label: "Share" },
            { name: "more", label: "More options" },
          ]}
          onAccessibilityAction={(e) => {
            const name = e.nativeEvent.actionName;
            if (name === "activate" || name === "magicTap") toggle();
            else if (name === "escape") router.back();
            else if (name === "increment") onNext();
            else if (name === "decrement") onPrevious();
            else if (name === "mute") onMute();
            else if (name === "fit") fitToggle();
            else if (name === "share") share();
            else if (name === "more") onMore();
          }}>
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit={fit} nativeControls={false} />
        </Animated.View>
      </GestureDetector>

      {status === "loading" && active ? (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator color={WHITE} size="large" />
        </View>
      ) : null}
      {status === "error" && active ? (
        <View style={styles.center}>
          <Text style={styles.title}>Couldn&apos;t play this reel.</Text>
          <Pressable accessibilityRole="button" onPress={() => url && player.replace({ uri: url, headers })} style={[styles.pill, { marginTop: 12 }]}>
            <Text style={styles.pillText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {(flash || paused) && !holding ? (
        <Animated.View exiting={reduced ? undefined : FadeOut.duration(200)} style={styles.center} pointerEvents="none">
          <View style={[styles.flash, !flash && styles.flashSmall]}>{(flash ?? "pause") === "pause" ? <PlayGlyph color={WHITE} size={flash ? 34 : 24} /> : <PauseGlyph color={WHITE} size={28} />}</View>
        </Animated.View>
      ) : null}

      {holding ? null : (
        <>
          <View style={[styles.top, { top: insets.top + 4 }]}>
            <RoundIcon label="Close" onPress={() => router.back()}>
              <Icon name="close" size={22} color={WHITE} />
            </RoundIcon>
            <View style={{ flex: 1, alignItems: "center" }}>
              {fitNote ? (
                <View style={styles.pill} accessibilityLiveRegion="polite">
                  <Text style={styles.pillText}>{fitNote}</Text>
                </View>
              ) : null}
            </View>
            <RoundIcon label={muted ? "Unmute" : "Mute"} onPress={onMute}>
              <Icon name={muted ? "mute" : "volume"} size={22} color={WHITE} />
            </RoundIcon>
          </View>

          {/* A soft dark fade behind the title and buttons, so white text reads on any frame. */}
          <Svg style={styles.fade} width="100%" height={260} pointerEvents="none">
            <Defs>
              <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#000000" stopOpacity="0" />
                <Stop offset="1" stopColor="#000000" stopOpacity="0.6" />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#fade)" />
          </Svg>
          <View style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]} pointerEvents="box-none">
            <View style={{ flex: 1, gap: 4 }} pointerEvents="none">
              <Text style={styles.title} numberOfLines={3}>
                {title}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {meta}
              </Text>
              {film.recipe?.handle ? <Text style={styles.sub}>{`Recipe by @${film.recipe.handle}`}</Text> : null}
            </View>
            <View style={styles.column}>
              <SideButton label="Share" icon="share" onPress={share} busy={sharing} />
              <SideButton label="Post" icon="send" onPress={() => router.push(`/reel/${film.id}`)} a11y="Post it" />
              <SideButton label="More" icon="more" onPress={onMore} a11y="More options" />
            </View>
          </View>
        </>
      )}
      <View style={[styles.track, { bottom: insets.bottom + 2 }]} pointerEvents="none">
        <View style={{ width: `${progress * 100}%`, height: "100%", backgroundColor: TEAL }} />
      </View>
    </View>
  );
}

function MoreSheet({ film, fit, onFit, onClose, onDeleted }: { film: Film; fit: Fit; onFit: () => void; onClose: () => void; onDeleted: (id: string) => void }) {
  const [note, setNote] = useState<string | null>(null);
  const then = (f: () => void) => () => {
    onClose();
    f();
  };
  async function save() {
    setNote("Saving…");
    try {
      const r = await saveReelToPhotos(film.id);
      setNote(r === "saved" ? "Saved to your Photos." : "Allow Reelkar to add to Photos in Settings, then try again.");
    } catch (err) {
      setNote((err as Error).message);
    }
  }
  return (
    <Sheet visible onClose={onClose}>
      <Txt variant="md" accessibilityRole="header" numberOfLines={1}>
        {film.title ?? "Your reel"}
      </Txt>
      <ListRow icon="download" title="Save to Photos" sub={note ?? undefined} onPress={save} />
      <ListRow icon={fit === "cover" ? "shrink" : "expand"} title={fit === "cover" ? "Fit to screen" : "Fill screen"} onPress={then(onFit)} />
      {film.format === "edit" ? <ListRow icon="edit" title="Fine-tune effects" onPress={then(() => router.push(`/edit/${film.id}`))} /> : null}
      <ListRow icon="calendar" title="Post or schedule" sub="Captions, accounts and times" onPress={then(() => router.push(`/reel/${film.id}`))} />
      <ListRow icon="trash" title="Delete reel" onPress={then(() => confirmDelete(film.id, () => onDeleted(film.id), (m) => Alert.alert("Couldn't delete", m), Boolean(film.recipe)))} />
    </Sheet>
  );
}

function RoundIcon({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} style={({ pressed }) => [styles.round, { opacity: pressed ? 0.7 : 1 }]}>
      {children}
    </Pressable>
  );
}

function SideButton({ label, icon, onPress, busy, a11y }: { label: string; icon: "share" | "send" | "more"; onPress: () => void; busy?: boolean; a11y?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y ?? label} onPress={onPress} disabled={busy} hitSlop={4} style={({ pressed }) => [styles.side, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={styles.round}>{busy ? <ActivityIndicator color={WHITE} /> : <Icon name={icon} size={20} color={WHITE} />}</View>
      <Text style={styles.sideText} maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  page: { flex: 1, backgroundColor: "#000000", overflow: "hidden" },
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  flash: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", backgroundColor: SCRIM },
  flashSmall: { width: 56, height: 56, borderRadius: 28 },
  top: { position: "absolute", left: 12, right: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: SCRIM },
  pill: { minHeight: 36, justifyContent: "center", paddingHorizontal: 14, borderRadius: 18, backgroundColor: SCRIM },
  pillText: { color: WHITE, fontFamily: fonts.bold, fontSize: 15 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "flex-end", gap: 12, paddingHorizontal: 16 },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0 },
  column: { gap: 16, alignItems: "center" },
  side: { alignItems: "center", gap: 4, minWidth: 48 },
  sideText: { color: WHITE, fontFamily: fonts.bold, fontSize: 12 },
  title: { color: WHITE, fontFamily: fonts.bold, fontSize: 17, lineHeight: 22 },
  sub: { color: "rgba(255,255,255,0.85)", fontFamily: fonts.medium, fontSize: 13 },
  track: { position: "absolute", left: 0, right: 0, height: 3, backgroundColor: "rgba(255,255,255,0.3)" },
});
