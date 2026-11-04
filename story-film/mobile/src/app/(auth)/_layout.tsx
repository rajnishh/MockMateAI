import { Stack } from "expo-router";

import { useTheme } from "@/theme";

export const unstable_settings = { initialRouteName: "welcome" };

export default function Layout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />;
}
