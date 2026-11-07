import { I18nManager, Pressable, StyleSheet } from "react-native";

import { filmNow } from "@/lib/capture";
import { useTheme } from "@/theme";
import { Icon } from "./icon";

// "Snap & suggest" (design/v3.0/quick-create.md 2, option B): a camera bubble at the bottom corner on the
// thumb side that films straight away, then "What should we make?" ranks what the clip can become.
// Only Home and Listen render it; screens add bottom padding so it never covers the last row.
export function InstantButton() {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Film now"
      accessibilityHint="Opens the camera, then suggests what to make"
      onPress={filmNow}
      style={({ pressed }) => [
        styles.bubble,
        I18nManager.isRTL ? { left: 16 } : { right: 16 },
        { backgroundColor: colors.action, borderColor: colors.surface, transform: [{ scale: pressed ? 0.94 : 1 }] },
      ]}>
      <Icon name="camera" color={colors.onAction} />
    </Pressable>
  );
}

// The space a screen leaves under its last row for the bubble.
export const INSTANT_CLEARANCE = 56 + 24;

const styles = StyleSheet.create({
  bubble: {
    position: "absolute",
    bottom: 12,
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
