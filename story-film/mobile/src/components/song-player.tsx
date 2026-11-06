import { type AudioPlaylist, type AudioSource, setAudioModeAsync, useAudioPlaylist, useAudioPlaylistStatus } from "expo-audio";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { SvgXml } from "react-native-svg";

import { api, type PublicSongCard, type Song, type SongAnalysis } from "@/lib/api";
import * as Q from "@/lib/listen-queue";
import { publicTrackSong } from "@/lib/listen";
import { formatTime, genreLabel } from "@/lib/songs";
import { getItem, setItem } from "@/lib/storage";
import { useTheme } from "@/theme";
import { coverUri } from "./song-cover";
import { Icon } from "./icon";
import { ProgressBar, Txt } from "./ui";

// A song in the queue: your own (key "own:<id>") or someone's public one ("s:<publicId>").
export type Track = Song & Q.QueueTrack;

const AUTOPLAY_KEY = "listen.autoplay";
const REPEAT_KEY = "listen.repeat";

// Repeat: "one" plays the same song again and again; "all" goes round the queue. Autoplay waits while either is on.
export type Repeat = "off" | "one" | "all";
const LOOP_MODE = { off: "none", one: "single", all: "all" } as const;
// The playlist is changed, not replaced, so this lives outside the hook.
function setLoop(playlist: AudioPlaylist, repeat: Repeat) {
  playlist.loop = LOOP_MODE[repeat];
}

export const trackOf = (s: Song): Track => ({ ...s, key: s.publicId ? `s:${s.publicId}` : `own:${s.id}` });
export const trackOfCard = (c: PublicSongCard): Track => trackOf(publicTrackSong(c));

// The app's one player, built on expo-audio's playlist so the lock screen's next and previous
// work. The queue lives here in JS (lib/listen-queue.ts); the native playlist is kept in step
// with it, only ever appending or dropping songs after the current one, because inserting
// rebuilds the native queue and would restart the song that's playing.
function usePlayerState() {
  const playlist = useAudioPlaylist({ updateInterval: 200 });
  const native = useAudioPlaylistStatus(playlist);
  const [queue, setQueue] = useState<Q.Queue<Track>>(Q.emptyQueue());
  const [autoplay, setAutoplayState] = useState(true);
  const [repeat, setRepeatState] = useState<Repeat>("off");
  const repeatRef = useRef<Repeat>("off");
  const nativeKeys = useRef<string[]>([]);
  const syncing = useRef<Promise<void>>(Promise.resolve());
  const fetching = useRef(false);
  const counted = useRef(new Set<string>());
  const lockKey = useRef<string | null>(null);
  const song = Q.current(queue) ?? null;

  useEffect(() => {
    // Songs play with the ring/silent switch off and keep going in the background, like other music apps.
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" }).catch(() => undefined);
    getItem(AUTOPLAY_KEY).then((v) => v === "off" && setAutoplayState(false), () => undefined);
    getItem(REPEAT_KEY).then((v) => (v === "one" || v === "all") && setRepeatState(v), () => undefined);
  }, []);

  // Native does the looping, so it carries on from the lock screen too.
  useEffect(() => {
    repeatRef.current = repeat;
    setLoop(playlist, repeat);
  }, [repeat, playlist]);

  const source = useCallback(async (t: Track): Promise<AudioSource> => {
    const uri = api.songAudioUrl(t) ?? "";
    // Your own songs need the session cookie; public ones don't.
    return t.publicId ? { uri } : { uri, headers: await api.videoHeaders() };
  }, []);

  // The latest native index and queue, for the effects below that must not wait for a render.
  const nativeIndex = useRef(0);
  const queueRef = useRef(queue);
  useEffect(() => {
    nativeIndex.current = native.currentIndex;
    queueRef.current = queue;
  });
  // The index we asked native to move to, until it says it's there; its own reports in between
  // (a clear briefly reports 0) aren't the listener's doing.
  const expected = useRef<number | null>(null);
  const expectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const finishedLast = useRef(false);

  const expect = (index: number) => {
    expected.current = index;
    clearTimeout(expectTimer.current);
    expectTimer.current = setTimeout(() => (expected.current = null), 2000);
  };

  // Native follows the JS queue.
  useEffect(() => {
    const target = queue.items.map((t) => t.key);
    const cur = queue.index;
    syncing.current = syncing.current.then(async () => {
      const have = nativeKeys.current;
      if (cur < 0) {
        if (have.length) playlist.clear();
        nativeKeys.current = [];
        return;
      }
      let common = 0;
      while (common < have.length && common < target.length && have[common] === target[common]) common++;
      if (common <= cur) {
        // A different song is current, or the songs before it changed: load the queue again from it.
        finishedLast.current = false;
        const sources = await Promise.all(queue.items.map(source));
        expect(cur);
        playlist.clear();
        sources.forEach((src) => playlist.add(src));
        if (cur > 0) playlist.skipTo(cur);
        playlist.play();
        nativeKeys.current = target;
        return;
      }
      // Same songs up to and past the current one: drop and append only after it.
      for (let i = have.length - 1; i >= common; i--) playlist.remove(i);
      for (const t of queue.items.slice(common)) playlist.add(await source(t));
      nativeKeys.current = target;
      if (nativeIndex.current !== cur) {
        // Next, Previous or a tap in Up next: move native there.
        finishedLast.current = false;
        expect(cur);
        playlist.skipTo(cur);
        playlist.play();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the queue drives native changes
  }, [queue]);

  // The lock screen, Control Center or a song ending moved native on: catch the queue up.
  useEffect(() => {
    if (expected.current !== null) {
      if (native.currentIndex === expected.current) expected.current = null;
      return;
    }
    if (native.trackCount !== nativeKeys.current.length || native.currentIndex === queueRef.current.index) return;
    setQueue((q) => Q.skipTo(q, native.currentIndex));
  }, [native.currentIndex, native.trackCount]);

  // The last song ended with nothing after it; when Autoplay's picks arrive, carry on with them.
  useEffect(() => {
    if (native.didJustFinish && repeatRef.current === "off" && native.currentIndex >= nativeKeys.current.length - 1) finishedLast.current = true;
  }, [native.didJustFinish, native.currentIndex]);
  useEffect(() => {
    if (finishedLast.current && Q.upNext(queue).length) {
      finishedLast.current = false;
      setQueue(Q.next);
    }
  }, [queue]);

  // Now-playing on the lock screen, with next and previous.
  useEffect(() => {
    if (!song) {
      if (lockKey.current) playlist.clearLockScreenControls();
      lockKey.current = null;
      return;
    }
    if (lockKey.current === song.key) return;
    const metadata = { title: song.title, artist: song.handle ? `@${song.handle}` : "Reelkar", albumTitle: genreLabel(song.genre), artworkUrl: coverUri(song) ?? undefined };
    if (lockKey.current) playlist.updateLockScreenMetadata(metadata);
    else playlist.setActiveForLockScreen(true, metadata, { showNextTrack: true, showPreviousTrack: true, showSeekBackward: false, showSeekForward: false });
    lockKey.current = song.key;
  }, [song, playlist]);

  // Autoplay: when one song is left, add related public songs not heard this session. Once
  // everything has been heard, it starts again with earlier songs rather than stopping.
  useEffect(() => {
    if (!Q.needsMore(queue, autoplay && repeat === "off") || fetching.current) return;
    fetching.current = true;
    const seed = Q.seedId(queue);
    (async () => {
      const fresh = await api.relatedSongs(seed, Q.excludeIds(queue));
      if (fresh.length) return setQueue((q) => Q.appendAuto(q, fresh.map(trackOfCard)));
      const again = await api.relatedSongs(seed, Q.repeatExcludeIds(queue));
      setQueue((q) => Q.appendAuto(q, again.map(trackOfCard), true));
    })()
      .catch(() => undefined)
      .finally(() => (fetching.current = false));
  }, [queue, autoplay, repeat]);

  // A public song counts as played after 10 seconds (the server keeps one per listener per day).
  useEffect(() => {
    if (!song?.publicId || native.currentTime < 10 || counted.current.has(song.key)) return;
    counted.current.add(song.key);
    api.countPlay(song.publicId).catch(() => undefined);
  }, [song, native.currentTime]);

  const status = useMemo(
    () => ({ playing: native.playing, currentTime: native.currentTime, duration: native.duration, isLoaded: native.isLoaded, isBuffering: native.isBuffering, didJustFinish: native.didJustFinish }),
    [native.playing, native.currentTime, native.duration, native.isLoaded, native.isBuffering, native.didJustFinish],
  );

  const play = useCallback(
    async (next: Song) => {
      if (song?.id === next.id) {
        if (status.duration > 0 && status.currentTime >= status.duration - 0.25) await playlist.seekTo(0);
        return playlist.play();
      }
      if (!api.songAudioUrl(next)) return;
      setQueue((q) => Q.playOne(q, trackOf(next)));
    },
    [playlist, song?.id, status.currentTime, status.duration],
  );

  const setAutoplay = useCallback((on: boolean) => {
    setAutoplayState(on);
    if (!on) setQueue(Q.dropAuto);
    setItem(AUTOPLAY_KEY, on ? "on" : "off").catch(() => undefined);
  }, []);

  const setRepeat = useCallback((r: Repeat) => {
    setRepeatState(r);
    setItem(REPEAT_KEY, r).catch(() => undefined);
  }, []);

  return useMemo(
    () => ({
      current: song?.id ?? null,
      song,
      status,
      queue,
      upNext: Q.upNext(queue),
      autoplay,
      setAutoplay,
      repeat,
      setRepeat,
      // Off, then all, then one, then off: the order music apps use.
      cycleRepeat: () => setRepeat(repeat === "off" ? "all" : repeat === "all" ? "one" : "off"),
      // Home's Loop: these songs from `start`, round and round.
      loop: (songs: Song[], start = 0) => {
        setRepeat("all");
        setQueue((q) => Q.playList(q, songs.map(trackOf), start));
      },
      play,
      // Plays a list from `start`; the rest of the list becomes the queue.
      playList: (songs: Song[], start: number) => setQueue((q) => Q.playList(q, songs.map(trackOf), start)),
      playNext: (s: Song) => setQueue((q) => Q.playNext(q, trackOf(s))),
      addToQueue: (s: Song) => setQueue((q) => Q.addToQueue(q, trackOf(s))),
      remove: (key: string) => setQueue((q) => Q.remove(q, key)),
      clear: () => setQueue(Q.clear),
      skipTo: (index: number) => setQueue((q) => Q.skipTo(q, index)),
      next: () => setQueue(Q.next),
      previous: () => {
        const r = Q.previous(queue, status.currentTime);
        if (r.restart) playlist.seekTo(0);
        else setQueue(r.queue);
      },
      pause: () => playlist.pause(),
      toggle: (s: Song) => (song?.id === s.id && status.playing ? playlist.pause() : play(s)),
      seekTo: (sec: number) => playlist.seekTo(Math.max(0, sec)),
      // ±10 s, kept inside the song.
      skip: (sec: number) => playlist.seekTo(Math.min(Math.max(0, status.currentTime + sec), Math.max(0, (status.duration || song?.durationSec || 0) - 0.5))),
      stop: () => {
        playlist.pause();
        setQueue(Q.emptyQueue());
      },
    }),
    [song, status, queue, autoplay, setAutoplay, repeat, setRepeat, play, playlist],
  );
}

export type SongPlayer = ReturnType<typeof usePlayerState>;

const PlayerContext = createContext<SongPlayer | null>(null);

// One player for the whole signed-in app: it keeps playing across screens, and starting a song stops the last one.
export function SongPlayerProvider({ children }: { children: ReactNode }) {
  const value = usePlayerState();
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function useSongPlayer(): SongPlayer {
  const p = useContext(PlayerContext);
  if (!p) throw new Error("useSongPlayer must be used inside SongPlayerProvider");
  return p;
}

// Beats, loudness and lyric timing, worked out once on the server; kept for the session.
const analyses = new Map<string, Promise<SongAnalysis>>();
export function useSongAnalysis(songId: string | null | undefined): SongAnalysis | null {
  const [data, setData] = useState<{ id: string; a: SongAnalysis } | null>(null);
  useEffect(() => {
    if (!songId) return;
    let live = true;
    let job = analyses.get(songId);
    if (!job) {
      job = api.songAnalysis(songId);
      analyses.set(songId, job);
      // A failure isn't cached, so the next open tries again.
      job.catch(() => analyses.delete(songId));
    }
    job.then((a) => live && setData({ id: songId, a })).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [songId]);
  return data && data.id === songId ? data.a : null;
}

// A round play/pause button with the song's progress and time next to it.
export function SongPlayerRow({ song, player }: { song: Song; player: SongPlayer }) {
  const { colors } = useTheme();
  const mine = player.current === song.id;
  const playing = mine && player.status.playing;
  const loading = mine && !player.status.isLoaded;
  const duration = mine && player.status.duration > 0 ? player.status.duration : song.durationSec;
  const at = mine ? player.status.currentTime : 0;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? `Pause ${song.title}` : `Play ${song.title}`}
        disabled={!song.audioUrl}
        onPress={() => player.toggle(song)}
        hitSlop={6}
        style={[styles.play, { backgroundColor: song.audioUrl ? colors.action : colors.surfaceSunken }]}>
        {loading ? <ActivityIndicator color={colors.onAction} /> : playing ? <PauseGlyph color={colors.onAction} /> : <Icon name="play" size={20} color={colors.onAction} />}
      </Pressable>
      <View style={{ flex: 1, gap: 6 }}>
        <ProgressBar value={duration ? at / duration : 0} />
        <Txt variant="mono" color="inkMuted">
          {`${formatTime(at)} / ${formatTime(duration)}`}
        </Txt>
      </View>
    </View>
  );
}

export function PauseGlyph({ color, size = 18 }: { color: string; size?: number }) {
  const w = Math.max(3, Math.round(size * 0.28));
  return (
    <View style={{ flexDirection: "row", gap: w * 0.8 }}>
      <View style={{ width: w, height: size, borderRadius: 2, backgroundColor: color }} />
      <View style={{ width: w, height: size, borderRadius: 2, backgroundColor: color }} />
    </View>
  );
}

// A filled play triangle, nudged right so it looks centred in a round button.
export function PlayGlyph({ color, size = 20 }: { color: string; size?: number }) {
  return <SvgXml xml={`<svg viewBox="0 0 24 24"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.4-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" fill="${color}"/></svg>`} width={size} height={size} style={{ marginLeft: size * 0.12 }} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  play: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
});
