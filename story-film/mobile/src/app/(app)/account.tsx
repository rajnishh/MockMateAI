import Constants from "expo-constants";
import { router } from "expo-router";
import { useState } from "react";
import { Linking, View } from "react-native";

import { Banner, Button, Card, ChipRow, Header, ListRow, Row, Screen, Txt } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { DEMO, PRIVACY_URL, SUPPORT_EMAIL } from "@/lib/config";
import { LANGUAGES } from "@/lib/languages";
import { useSession } from "@/lib/session";
import { useTheme, type Mode } from "@/theme";

export default function Account() {
  const { user, prefs, savePrefs, signOut } = useSession();
  const { preference, setPreference, colors } = useTheme();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteAccount() {
    setError(null);
    try {
      if (!DEMO) {
        const { error: e } = await authClient.deleteUser();
        if (e) throw new Error(e.message ?? "Couldn't delete your account");
      }
      await signOut();
    } catch (err) {
      setError(`${(err as Error).message}. For your safety, sign out and sign in again, then try once more.`);
    }
  }

  return (
    <Screen>
      <Header title="Account" back />
      <Card>
        <Row style={{ gap: 14 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.tealTint, alignItems: "center", justifyContent: "center" }}>
            <Txt variant="md" color="tealText">
              {(user?.name ?? "C").charAt(0).toUpperCase()}
            </Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="md">{user?.name ?? "Creator"}</Txt>
            <Txt variant="cap">Free beta{prefs?.topic ? ` · ${prefs.topic}` : ""}</Txt>
          </View>
        </Row>
      </Card>

      <Card>
        <Txt variant="md">Reel language</Txt>
        <ChipRow
          options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
          value={prefs?.language ?? "hi"}
          onChange={(language) => prefs && savePrefs({ ...prefs, language })}
        />
        <Txt variant="md">Look</Txt>
        <ChipRow<Mode | "system">
          options={[
            { value: "system", label: "Same as phone" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
          value={preference}
          onChange={setPreference}
        />
      </Card>

      <Card>
        <ListRow icon="sparkle" title="Credits and plans" onPress={() => router.push("/credits")} />
        <ListRow icon="film" title="My reels" onPress={() => router.push("/reels")} />
        {SUPPORT_EMAIL ? (
          <ListRow
            icon="send"
            title="Send feedback"
            sub={SUPPORT_EMAIL}
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Reelkar%20beta%20feedback`).catch(() => undefined)}
          />
        ) : null}
        {PRIVACY_URL ? <ListRow icon="lock" title="Privacy policy" onPress={() => Linking.openURL(PRIVACY_URL).catch(() => undefined)} /> : null}
      </Card>

      <Button label="Sign out" kind="secondary" icon="out" block onPress={signOut} />

      <Card flat>
        <Txt variant="label" color="danger">
          Delete my account
        </Txt>
        <Txt variant="cap">Deletes your account, reels, voices and connected accounts. This can&apos;t be undone.</Txt>
        {error ? <Banner kind="error" text={error} /> : null}
        {confirm ? (
          <Row>
            <Button label="Yes, delete everything" kind="danger" small onPress={deleteAccount} />
            <Button label="Cancel" kind="ghost" small onPress={() => setConfirm(false)} />
          </Row>
        ) : (
          <Button label="Delete account" kind="danger" small onPress={() => setConfirm(true)} />
        )}
      </Card>
      <Txt variant="cap" style={{ textAlign: "center" }}>
        Reelkar {Constants.expoConfig?.version ?? ""}{DEMO ? " · demo mode" : ""}
      </Txt>
    </Screen>
  );
}
