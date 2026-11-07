import { I18nManager, Pressable, StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, withTiming } from "react-native-reanimated";

import { filmNow, snapPhoto } from "@/lib/capture";
import { instantSmall, useInstantLeft } from "@/lib/instant-prefs";
import { useTheme } from "@/theme";
import { Icon } from "./icon";

// "Snap & suggest" (design/v3.0/quick-create.md 2, option B): a camera bubble at the bottom corner on the
// thumb side. Tap films, hold snaps a photo; then "What should we make?" ranks what it can become.
// Only Home and Listen render it; they pass instantScrollProps to Screen so it shrinks while scrolling down,
// and leave INSTANT_CLEARANCE under the last row. Settings can move it to the left.
export function InstantButton() {
  const { colors } = useTheme();
  const leftHanded = useInstantLeft();
  const reduced = useReducedMotion();
  // The start side flips in Arabic; the left-handed switch flips it again.
  const onLeft = leftHanded !== I18nManager.isRTL;
  const shrink = useAnimatedStyle(() => ({
    transform: [{ scale: reduced ? 1 : withTiming(instantSmall.value ? 44 / 56 : 1, { duration: 180 }) }],
  }));
  return (
    <Animated.View style={[styles.wrap, onLeft ? { left: 16 } : { right: 16 }, shrink]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Film now"
        accessibilityHint="Opens the camera, then suggests what to make. Hold to take a photo instead."
        accessibilityActions={[{ name: "longpress", label: "Take a photo" }]}
        onAccessibilityAction={(e) => e.nativeEvent.actionName === "longpress" && snapPhoto()}
        onPress={filmNow}
        onLongPress={snapPhoto}
        delayLongPress={450}
        style={({ pressed }) => [styles.bubble, { backgroundColor: colors.action, borderColor: colors.surface, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
        <Icon name="camera" color={colors.onAction} />
      </Pressable>
    </Animated.View>
  );
}

// The space a screen leaves under its last row for the bubble.
export const INSTANT_CLEARANCE = 56 + 24;

const styles = StyleSheet.create({
  wrap: { position: "absolute", bottom: 12 },
  bubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2a1235",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
