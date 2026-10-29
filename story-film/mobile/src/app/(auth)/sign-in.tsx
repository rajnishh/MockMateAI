import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Banner, Button, Field, Header, Screen, Txt } from "@/components/ui";
import { useSession } from "@/lib/session";
import { useTheme } from "@/theme";

export default function SignIn() {
  const { signInWithGoogle, sendOtp } = useSession();
  const { colors } = useTheme();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<"google" | "phone" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const valid = phone.replace(/\D/g, "").length === 10;

  async function run(kind: "google" | "phone", fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <Header title="Sign in or create your account" back />
      {error ? <Banner kind="error" text={error} /> : null}
      <Button label="Continue with Google" kind="secondary" block loading={busy === "google"} onPress={() => run("google", signInWithGoogle)} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
        <Txt variant="cap">or</Txt>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
      </View>
      <Field
        label="Indian mobile number (+91)"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        placeholder="98765 43210"
        maxLength={14}
      />
      <Button
        label="Send code"
        block
        disabled={!valid}
        loading={busy === "phone"}
        onPress={() =>
          run("phone", async () => {
            await sendOtp(phone);
            router.push({ pathname: "/otp", params: { phone } });
          })
        }
      />
      <Txt variant="cap">We&apos;ll send a 6-digit code by SMS. Outside India? Use Google for now.</Txt>
    </Screen>
  );
}
