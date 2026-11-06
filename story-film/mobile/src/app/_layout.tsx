import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";
import { Hind_400Regular, Hind_600SemiBold } from "@expo-google-fonts/hind";
import { BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from "@expo-google-fonts/inter";
import { useLinkingURL } from "expo-linking";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AnimatedSplash } from "@/components/splash";
import { useAppUpdates } from "@/lib/app-updates";
import { rememberCreateLink, rememberReelLink } from "@/lib/pending-link";
import { SessionProvider, useSession } from "@/lib/session";
import { ThemeProvider, useTheme } from "@/theme";

SplashScreen.preventAutoHideAsync();

// Long enough for the reel to turn once on the animated splash, so opening never flashes.
const MIN_SPLASH_MS = 1400;

function RootStack() {
  const { ready, user, onboarded } = useSession();
  const { mode, colors } = useTheme();
  const [shown, setShown] = useState(false);
  const url = useLinkingURL();
  useAppUpdates();

  // Signed out, a reel link lands on sign-in; remember it so it opens once they're in.
  useEffect(() => {
    if (url && ready && !(user && onboarded)) {
      rememberReelLink(url);
      rememberCreateLink(url);
    }
  }, [url, ready, user, onboarded]);

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
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    BricolageGrotesque_800ExtraBold,
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
