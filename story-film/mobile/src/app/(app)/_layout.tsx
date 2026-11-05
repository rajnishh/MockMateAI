import { Stack } from "expo-router";

import { SongPlayerProvider } from "@/components/song-player";
import { useTheme } from "@/theme";

export default function AppLayout() {
  const { colors } = useTheme();
  return (
    // One song player for the whole app, so a song keeps playing from screen to screen.
    <SongPlayerProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="songs/play/[id]" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
      </Stack>
    </SongPlayerProvider>
  );
}
