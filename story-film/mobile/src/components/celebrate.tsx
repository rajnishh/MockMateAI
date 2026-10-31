import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

import { useTheme } from "@/theme";
import { useReducedMotion } from "./logo";

const PIECES = 16;

// A finished reel: one ring bursts out of the middle, then confetti falls once. Draws over its
// parent (give the parent overflow: hidden) and never takes touches.
export function Celebrate() {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [p] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduced) return;
    const a = Animated.timing(p, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [p, reduced]);

  if (reduced) return null;
  const palette = [colors.coral, colors.teal, colors.pop, "#ffffff"];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Animated.View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            borderWidth: 4,
            borderColor: colors.coral,
            opacity: p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 0] }),
            transform: [{ scale: p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 3.2, 3.2] }) }],
          }}
        />
      </View>
      {Array.from({ length: PIECES }, (_, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            top: -14,
            left: `${4 + i * 6}%`,
            width: 8,
            height: 14,
            borderRadius: 2,
            backgroundColor: palette[i % palette.length],
            opacity: p.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [0, 380 + (i % 4) * 30] }) },
              { rotate: p.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${(i % 2 ? 1 : -1) * (360 + i * 20)}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ center: { alignItems: "center", justifyContent: "center" } });
