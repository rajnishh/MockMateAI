import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, useTheme } from "@/theme";
import { Icon, type IconName } from "./icon";

const ICONS: Record<string, IconName> = { home: "home", create: "plus", calendar: "calendar", inbox: "inbox", listen: "headphones" };

// v3.0: a floating deep-plum bar. Create is the round chilli button in the middle; the current tab is mint.
export function TabBar({ state, descriptors, navigateToTab }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const muted = "rgba(255, 241, 230, 0.68)";
  return (
    <View style={{ backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 10), paddingHorizontal: 12, paddingTop: 6 }}>
      <View accessibilityRole="tablist" style={[styles.bar, { backgroundColor: colors.deep }]}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const label = descriptors[route.key].options.title ?? route.name;
          const create = route.name === "create";
          const fg = create ? colors.onAction : focused ? colors.teal : muted;
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
              {create ? (
                <View style={[styles.make, { backgroundColor: colors.action, borderColor: focused ? colors.action : "transparent" }]}>
                  <Icon name="plus" color={fg} />
                </View>
              ) : (
                <>
                  <View style={styles.pill}>
                    <Icon name={ICONS[route.name] ?? "home"} color={fg} />
                  </View>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 11, color: fg }}>{label}</Text>
                </>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 24,
    paddingVertical: 6,
    paddingHorizontal: 4,
    shadowColor: "#2a1235",
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, minHeight: 52 },
  pill: { width: 44, height: 28, alignItems: "center", justifyContent: "center" },
  make: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", borderWidth: 2 },
});
