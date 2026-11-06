import { Stack } from "expo-router";
import { useEffect } from "react";

import { SongPlayerProvider } from "@/components/song-player";
import { listenForTaps, registerForPush } from "@/lib/push";
import { useTheme } from "@/theme";

export default function AppLayout() {
  const { colors } = useTheme();
  // Notifications about gifts and Jugalbandis: keep the token fresh if allowed, and open what's tapped.
  useEffect(() => {
    registerForPush(false).catch(() => undefined);
    return listenForTaps();
  }, []);
  return (
    // One song player for the whole app, so a song keeps playing from screen to screen.
    <SongPlayerProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="songs/play/[id]" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="watch/[id]" options={{ presentation: "fullScreenModal", animation: "fade", contentStyle: { backgroundColor: "#000000" } }} />
        <Stack.Screen name="listen/queue" options={{ presentation: "formSheet", sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true }} />
      </Stack>
    </SongPlayerProvider>
  );
}
