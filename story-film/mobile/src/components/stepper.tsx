import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, View } from "react-native";

import { fonts, radius, size, useTheme } from "@/theme";
import { Txt } from "./ui";

// A − value + row for numbers (seconds, percent). VoiceOver can swipe it up and down.
export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  step,
  disabled,
  format = (n) => `${n} s`,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  format?: (n: number) => string;
}) {
  const { colors } = useTheme();
  const set = (n: number) => {
    const next = Math.min(max, Math.max(min, Math.round(n * 100) / 100));
    if (next !== value) Haptics.selectionAsync().catch(() => undefined);
    onChange(next);
  };
  const btn = (sign: 1 | -1) => {
    const off = disabled || (sign < 0 ? value <= min : value >= max);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${sign < 0 ? "Less" : "More"} ${label.toLowerCase()}`}
        disabled={off}
        onPress={() => set(value + sign * step)}
        style={[styles.btn, { borderColor: colors.lineStrong, opacity: off ? 0.4 : 1 }]}>
        <Txt variant="md">{sign < 0 ? "−" : "+"}</Txt>
      </Pressable>
    );
  };
  return (
    <View
      style={[styles.row, { opacity: disabled ? 0.5 : 1 }]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: format(value) }}
      accessibilityState={{ disabled }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => !disabled && set(value + (e.nativeEvent.actionName === "increment" ? step : -step))}>
      <Txt variant="label" style={{ flex: 1 }}>
        {label}
      </Txt>
      {btn(-1)}
      <Txt variant="mono" style={{ minWidth: 64, textAlign: "center", fontFamily: fonts.mono }}>
        {format(value)}
      </Txt>
      {btn(1)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52 },
  btn: { width: size.tapMin, height: size.tapMin, borderRadius: radius.pill, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
