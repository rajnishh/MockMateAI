import { isPictureInPictureSupported, useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { api, type Film } from "@/lib/api";
import { fonts } from "@/theme";
import { Icon } from "./icon";

// The reel playing inside the screen. Picture-in-picture keeps it going in a corner while the
// creator writes the caption or switches to Instagram (needs a dev or store build, not Expo Go).
export function ReelVideo({ film, autoPlay = false, compact = false }: { film: Film; autoPlay?: boolean; compact?: boolean }) {
  const view = useRef<VideoView>(null);
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  const [inPip, setInPip] = useState(false);
  const [pip] = useState(() => isPictureInPictureSupported());

  useEffect(() => {
    api.videoHeaders().then(setHeaders);
  }, []);

  const url = api.videoUrl(film);
  // The video needs the session cookie, so wait for it before creating the source.
  const player = useVideoPlayer(url && headers ? { uri: url, headers } : null, (p) => {
    p.loop = true;
    if (autoPlay) p.play();
  });

  if (!url || !headers) return <View style={styles.box} />;
  return (
    <View style={styles.box}>
      <VideoView
        ref={view}
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls
        allowsPictureInPicture={pip}
        startsPictureInPictureAutomatically={pip}
        onPictureInPictureStart={() => setInPip(true)}
        onPictureInPictureStop={() => setInPip(false)}
      />
      {pip && !inPip && !compact ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pop out the video"
          hitSlop={8}
          onPress={() => {
            player.play();
            view.current?.startPictureInPicture().catch(() => undefined);
          }}
          style={styles.pip}>
          <Icon name="pip" size={16} color="#ffffff" />
          <Text style={styles.pipText}>Pop out</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "#0b1220" },
  pip: {
    position: "absolute",
    top: 10,
    right: 10,
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: "rgba(21,10,26,0.72)",
  },
  pipText: { color: "#ffffff", fontFamily: fonts.bold, fontSize: 13 },
});
