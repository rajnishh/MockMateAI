import { StyleSheet, Text, View } from "react-native";

import type { SocialPlatform } from "@/lib/api";
import { fonts, useTheme } from "@/theme";

// Neutral two-letter tiles; official logos are used only where a platform requires them.
export function PlatformTile({ platform, size = 24 }: { platform: SocialPlatform | null; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityLabel={platform === "youtube" ? "YouTube" : "Instagram"}
      style={[styles.tile, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: colors.surfaceSunken, borderColor: colors.lineStrong }]}>
      <Text style={{ fontFamily: fonts.extrabold, fontSize: size * 0.45, color: colors.ink }}>{platform === "youtube" ? "YT" : "IG"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: "center", justifyContent: "center", borderWidth: 1 },
});
