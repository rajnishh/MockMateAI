import * as AppleAuthentication from "expo-apple-authentication";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";

import { Banner, Button, ChipRow, Field, Header, Screen, Txt } from "@/components/ui";
import { API_URL, DEMO } from "@/lib/config";
import { findCountry, isValidMobile, PHONE_COUNTRIES, type PhoneCountry, toE164 } from "@/lib/phone";
import { useSession } from "@/lib/session";
import { radius, size, useTheme } from "@/theme";

type Method = "phone" | "email";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignIn() {
  const { signInWithGoogle, signInWithApple, sendOtp, clearPendingSignIn } = useSession();
  const { colors, mode } = useTheme();
  const [appleReady, setAppleReady] = useState(false);
  const [google, setGoogle] = useState(DEMO);
  const [method, setMethod] = useState<Method>("phone");
  const [country, setCountry] = useState<PhoneCountry>("IN");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"apple" | "google" | "code" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const info = findCountry(country);

  // Back here to change the number: the code sent before is no longer the step to resume.
  useEffect(() => {
    clearPendingSignIn();
  }, [clearPendingSignIn]);
  // The server says whether Google is set up, so the button never leads to an error.
  useEffect(() => {
    if (DEMO) return;
    fetch(`${API_URL}/api/sign-in-options`)
      .then((r) => r.json())
      .then((o: { google?: boolean }) => setGoogle(Boolean(o.google)))
      .catch(() => setGoogle(false));
  }, []);
  useEffect(() => {
    if (Platform.OS === "ios") AppleAuthentication.isAvailableAsync().then(setAppleReady, () => setAppleReady(false));
  }, []);
  const address = email.trim().toLowerCase();
  const valid = method === "phone" ? isValidMobile(country, phone) : EMAIL.test(address);

  async function run(kind: "apple" | "google" | "code", fn: () => Promise<unknown>) {
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
      {appleReady ? (
        // Apple's own button, as its guidelines ask, at least as prominent as Google's.
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={mode === "dark" ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={radius.pill}
          style={{ height: size.buttonHeight, width: "100%", opacity: busy === "apple" ? 0.6 : 1 }}
          onPress={() => (busy ? undefined : run("apple", signInWithApple))}
        />
      ) : null}
      {google ? <Button label="Continue with Google" kind="secondary" block loading={busy === "google"} onPress={() => run("google", signInWithGoogle)} /> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
        <Txt variant="cap">or get a code</Txt>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
      </View>
      <ChipRow
        options={[
          { value: "phone", label: "Mobile number" },
          { value: "email", label: "Email" },
        ]}
        value={method}
        onChange={(m) => {
          setMethod(m);
          setError(null);
        }}
      />
      {method === "phone" ? (
        <>
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
        </>
      ) : (
        <Field
          label="Email address"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          placeholder="name@example.com"
        />
      )}
      <Button
        label="Send code"
        block
        disabled={!valid}
        loading={busy === "code"}
        onPress={() =>
          run("code", async () => {
            const to = method === "phone" ? toE164(country, phone) : address;
            await sendOtp(to);
            router.push({ pathname: "/otp", params: { to } });
          })
        }
      />
      <Txt variant="cap">
        {method === "phone"
          ? `We'll send a 6-digit code by SMS to Indian and UAE numbers. Somewhere else? Use ${[appleReady && "Apple", google && "Google"].filter(Boolean).concat("email").join(", ").replace(/, ([^,]*)$/, " or $1")}.`
          : "We'll email you a 6-digit code. No password needed."}
      </Txt>
    </Screen>
  );
}
