import { router } from "expo-router";
import { Linking, Text, View } from "react-native";

import { Logo } from "@/components/icon";
import { Button, Screen, Txt } from "@/components/ui";
import { PRIVACY_URL, TERMS_URL } from "@/lib/config";
import { useTheme } from "@/theme";

export default function Welcome() {
  const { colors } = useTheme();
  return (
    <Screen
      footer={
        <>
          <Button label="Get started free" block onPress={() => router.push("/sign-in")} />
          <Button label="I already have an account" kind="secondary" block onPress={() => router.push("/sign-in")} />
          <Txt variant="cap" style={{ textAlign: "center" }}>
            By continuing you agree to the{" "}
            <Text accessibilityRole="link" style={{ color: colors.coralText, textDecorationLine: "underline" }} onPress={() => Linking.openURL(TERMS_URL).catch(() => undefined)}>
              Terms
            </Text>{" "}
            and{" "}
            <Text accessibilityRole="link" style={{ color: colors.coralText, textDecorationLine: "underline" }} onPress={() => Linking.openURL(PRIVACY_URL).catch(() => undefined)}>
              Privacy Policy
            </Text>
            .
          </Txt>
        </>
      }>
      <View style={{ paddingTop: 32, gap: 20 }}>
        <Logo size={72} />
        <Txt variant="xl">Become a creator.{"\n"}We do the hard parts.</Txt>
        <Txt variant="body" color="inkMuted">
          Ideas, reels, captions and posting in one place. Start free, no editing skills needed.
        </Txt>
        <Txt variant="cap">Free to start · Hindi, English, Marathi, Bengali, Tamil, Telugu and Arabic reels</Txt>
      </View>
    </Screen>
  );
}
