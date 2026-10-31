import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { fonts, useTheme } from "@/theme";
import { ReelLogo, useReducedMotion } from "./logo";

// The opening screen while the app gets ready: the reel turns with rings pulsing out, then the
// name rises in. The native splash (static logo on the same background) hands over to this.
export function AnimatedSplash() {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [rise] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduced) {
      rise.setValue(1);
      return;
    }
    const a = Animated.timing(rise, { toValue: 1, duration: 600, delay: 500, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [rise, reduced]);

  const enter = { opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] };
  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface }]} accessibilityLabel="Reelkar is opening">
      <ReelLogo size={112} loop rings />
      <Animated.View style={[styles.words, enter]}>
        <Text style={{ fontFamily: fonts.extrabold, fontSize: 44, letterSpacing: -1.2, color: colors.brandText }}>
          Reelkar<Text style={{ color: colors.coralText }}>.</Text>
        </Text>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.inkMuted }}>Your reel studio, in your pocket</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18 },
  words: { alignItems: "center", gap: 6 },
});
