import { Stack } from "expo-router";

import { useTheme } from "@/theme";

export default function AppLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
