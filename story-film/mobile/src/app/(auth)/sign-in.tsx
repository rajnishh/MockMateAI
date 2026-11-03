import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Banner, Button, ChipRow, Field, Header, Screen, Txt } from "@/components/ui";
import { findCountry, isValidMobile, PHONE_COUNTRIES, type PhoneCountry, toE164 } from "@/lib/phone";
import { useSession } from "@/lib/session";
import { useTheme } from "@/theme";

export default function SignIn() {
  const { signInWithGoogle, sendOtp } = useSession();
  const { colors } = useTheme();
  const [country, setCountry] = useState<PhoneCountry>("IN");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<"google" | "phone" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const info = findCountry(country);
  const valid = isValidMobile(country, phone);

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
      <ChipRow
        options={PHONE_COUNTRIES.map((c) => ({ value: c.code, label: `${c.name} ${c.dial}` }))}
        value={country}
        onChange={setCountry}
      />
      <Field
        label={`${info.name} mobile number (${info.dial})`}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        placeholder={info.example}
        maxLength={16}
      />
      <Button
        label="Send code"
        block
        disabled={!valid}
        loading={busy === "phone"}
        onPress={() =>
          run("phone", async () => {
            const e164 = toE164(country, phone);
            await sendOtp(e164);
            router.push({ pathname: "/otp", params: { phone: e164 } });
          })
        }
      />
      <Txt variant="cap">We&apos;ll send a 6-digit code by SMS. Somewhere else? Use Google for now.</Txt>
    </Screen>
  );
}
