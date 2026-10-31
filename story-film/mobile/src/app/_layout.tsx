import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";
import { Hind_400Regular, Hind_600SemiBold } from "@expo-google-fonts/hind";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/plus-jakarta-sans";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AnimatedSplash } from "@/components/splash";
import { SessionProvider, useSession } from "@/lib/session";
import { ThemeProvider, useTheme } from "@/theme";

SplashScreen.preventAutoHideAsync();

// Long enough for the reel to turn once on the animated splash, so opening never flashes.
const MIN_SPLASH_MS = 1400;

function RootStack() {
  const { ready, user, onboarded } = useSession();
  const { mode, colors } = useTheme();
  const [shown, setShown] = useState(false);

  // Fonts are loaded once this renders: swap the static native splash for the animated one.
  useEffect(() => {
    SplashScreen.hideAsync();
    const timer = setTimeout(() => setShown(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!ready || !shown) return <AnimatedSplash />;

  return (
    <>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={!user}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={Boolean(user) && !onboarded}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={Boolean(user) && onboarded}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    Hind_400Regular,
    Hind_600SemiBold,
    JetBrainsMono_500Medium,
  });
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SessionProvider>
          <RootStack />
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
