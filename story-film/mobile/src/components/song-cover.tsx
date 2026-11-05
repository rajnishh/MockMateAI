import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { api, type Song } from "@/lib/api";
import { useTheme } from "@/theme";

// A song's square AI cover art, loaded with the session cookie. Until it's made (or if it failed)
// a saffron tile with a note stands in, so cards keep their shape.
export function SongCover({ song, size }: { song: Song; size: number }) {
  const { colors } = useTheme();
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  const uri = api.songCoverUrl(song);

  useEffect(() => {
    if (uri) api.videoHeaders().then(setHeaders, () => setHeaders({}));
  }, [uri]);

  const radius = Math.round(size * 0.16);
  if (uri && headers) {
    return <Image source={{ uri, headers }} style={{ width: size, height: size, borderRadius: radius }} contentFit="cover" transition={200} accessibilityIgnoresInvertColors accessible={false} />;
  }
  return (
    <View accessible={false} style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: size * 0.42 }}>🎵</Text>
    </View>
  );
}
