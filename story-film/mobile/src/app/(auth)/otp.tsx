import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";

import { Banner, Button, Field, Header, Row, Screen, Txt } from "@/components/ui";
import { toE164India, useSession } from "@/lib/session";

export default function Otp() {
  const { phone = "" } = useLocalSearchParams<{ phone: string }>();
  const { verifyOtp, sendOtp } = useSession();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(30);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      // On success the session changes and the router moves on to onboarding.
      await verifyOtp(phone, code);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Header title="Enter the code" sub={`Sent to ${toE164India(phone)}`} back />
      <Field
        label="6-digit code"
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        autoFocus
        style={{ fontSize: 24, letterSpacing: 8, textAlign: "center" }}
      />
      {error ? <Banner kind="error" text={`${error}. Check the SMS and try again.`} /> : null}
      <Button label="Verify" block disabled={code.length !== 6} loading={busy} onPress={verify} />
      <Row style={{ justifyContent: "space-between" }}>
        {wait > 0 ? (
          <Txt variant="cap">Resend code in 0:{String(wait).padStart(2, "0")}</Txt>
        ) : (
          <Button label="Resend code" kind="ghost" onPress={() => sendOtp(phone).then(() => setWait(30), (e) => setError(e.message))} />
        )}
      </Row>
    </Screen>
  );
}
