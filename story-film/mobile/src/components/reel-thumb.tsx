import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { fonts, radius, useTheme } from "@/theme";
import { Icon } from "./icon";

// Placeholder art until a real thumbnail exists: simple brand shapes, varied by seed.
export function ReelThumb({ seed = 0, duration, playable, width }: { seed?: number; duration?: string; playable?: boolean; width?: number }) {
  const { colors } = useTheme();
  const sets = [
    [colors.tealTint, colors.coral, colors.teal],
    [colors.coralTint, colors.teal, colors.brand],
    [colors.surfaceSunken, colors.coral, colors.brand],
    [colors.tealTint, colors.brand, colors.coral],
  ];
  const [bg, sun, hill] = sets[Math.abs(seed) % sets.length];
  return (
    <View style={[styles.thumb, width ? { width } : { width: "100%" }]}>
      <Svg viewBox="0 0 90 160" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
        <Rect width={90} height={160} fill={bg} />
        <Circle cx={62 - (Math.abs(seed) % 4) * 9} cy={46} r={15} fill={sun} />
        <Path d="M0 122 30 94l22 18 18-14 20 16v46H0z" fill={hill} />
      </Svg>
      {playable ? (
        <View style={styles.play}>
          <Icon name="play" size={18} color="#ffffff" />
        </View>
      ) : null}
      {duration ? (
        <View style={styles.time}>
          <Text style={styles.timeText}>{duration}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { aspectRatio: 9 / 16, borderRadius: radius.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  play: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(17,24,39,0.55)", alignItems: "center", justifyContent: "center" },
  time: { position: "absolute", right: 6, bottom: 6, backgroundColor: "rgba(17,24,39,0.55)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  timeText: { color: "#ffffff", fontFamily: fonts.mono, fontSize: 11.5 },
});
