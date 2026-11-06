import { useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { ReelViewer } from "@/components/reel-viewer";
import { useSongPlayer } from "@/components/song-player";
import { Txt } from "@/components/ui";
import { api, type Film } from "@/lib/api";
import { viewerList } from "@/lib/viewer-list";

// Reels full screen, opened at the one you tapped, paging through the list it came from (Home's
// rail, My reels). A link with no list pages through all your ready reels.
export default function Watch() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [films] = useState(() => viewerList.get());
  const [all, setAll] = useState<Film[] | null>(null);
  const [error, setError] = useState(false);
  const songs = useSongPlayer();

  useEffect(() => {
    if (films?.some((f) => f.id === id)) return;
    api.films().then((list) => setAll(list.filter((f) => f.status === "completed" && f.videoUrl)), () => setError(true));
  }, [films, id]);
  useEffect(() => () => viewerList.clear(), []);

  // One sound at a time: a reel with sound pauses the song, and the song carries on after.
  const latest = useRef(songs);
  useEffect(() => {
    latest.current = songs;
  });
  const pausedSong = useRef(false);
  const onSound = useCallback((on: boolean) => {
    const p = latest.current;
    if (on && p.status.playing) {
      p.pause();
      pausedSong.current = true;
    }
  }, []);
  useEffect(
    () => () => {
      const p = latest.current;
      if (pausedSong.current && p.song) p.play(p.song);
    },
    [],
  );

  const list = films?.some((f) => f.id === id) ? films : all;
  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      <StatusBar style="light" />
      {list?.length ? (
        <ReelViewer films={list} startId={id} onSound={onSound} />
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          {error || (list && !list.length) ? <Txt style={{ color: "#ffffff" }}>Couldn&apos;t load your reels.</Txt> : <ActivityIndicator color="#ffffff" />}
        </View>
      )}
    </View>
  );
}
