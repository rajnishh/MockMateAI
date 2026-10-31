import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, useTheme } from "@/theme";
import { Icon, type IconName } from "./icon";

const ICONS: Record<string, IconName> = { home: "home", create: "plus", calendar: "calendar", inbox: "inbox", earn: "earn" };

// Five places a creator uses every day; Create is always the navy (teal in dark) action pill.
export function TabBar({ state, descriptors, navigateToTab }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.bar, { backgroundColor: colors.surfaceRaised, borderTopColor: colors.line, paddingBottom: Math.max(insets.bottom, 10) }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const label = descriptors[route.key].options.title ?? route.name;
        const create = route.name === "create";
        const fg = create ? colors.onAction : focused ? colors.tealText : colors.inkMuted;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={() => {
              if (!focused) navigateToTab(route.key);
            }}
            style={styles.tab}>
            <View style={[styles.pill, { backgroundColor: create ? colors.action : focused ? colors.tealTint : "transparent" }]}>
              <Icon name={ICONS[route.name] ?? "home"} color={fg} />
            </View>
            <Text style={{ fontFamily: fonts.bold, fontSize: 11.5, color: focused ? colors.tealText : colors.inkMuted }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  tab: { flex: 1, alignItems: "center", gap: 2, minHeight: 52 },
  pill: { width: 52, height: 30, borderRadius: 99, alignItems: "center", justifyContent: "center" },
});
