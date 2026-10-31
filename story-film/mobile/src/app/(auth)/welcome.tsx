import { router } from "expo-router";
import { View } from "react-native";

import { Logo } from "@/components/icon";
import { Button, Screen, Txt } from "@/components/ui";

export default function Welcome() {
  return (
    <Screen
      footer={
        <>
          <Button label="Get started free" block onPress={() => router.push("/sign-in")} />
          <Button label="I already have an account" kind="secondary" block onPress={() => router.push("/sign-in")} />
          <Txt variant="cap" style={{ textAlign: "center" }}>
            By continuing you agree to the Terms and Privacy Policy.
          </Txt>
        </>
      }>
      <View style={{ paddingTop: 32, gap: 20 }}>
        <Logo size={72} />
        <Txt variant="xl">Become a creator.{"\n"}We do the hard parts.</Txt>
        <Txt variant="body" color="inkMuted">
          Ideas, reels, captions and posting in one place. Start free, no editing skills needed.
        </Txt>
        <Txt variant="cap">Free beta · Hindi, English, Marathi, Bengali, Tamil, Telugu and Arabic reels</Txt>
      </View>
    </Screen>
  );
}
