import Constants from "expo-constants";
import { router } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";

import { Banner, Button, Card, ChipRow, Field, Header, ListRow, Row, Screen, Txt } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { DEMO, PRIVACY_URL, SUPPORT_EMAIL } from "@/lib/config";
import { LANGUAGES } from "@/lib/languages";
import { type Brand, useSession } from "@/lib/session";
import { useTheme, type Mode } from "@/theme";

// Brand colours offered for motion reels; "" lets the AI pick a theme per reel.
const BRAND_COLOURS = ["", "#e0198a", "#c2410c", "#0a756b", "#2563eb", "#7c3aed", "#111827"];

export default function Account() {
  const { user, prefs, savePrefs, signOut } = useSession();
  const { preference, setPreference, colors } = useTheme();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const brand: Brand = prefs?.brand ?? {};
  const [handle, setHandle] = useState(brand.handle ?? "");
  const saveBrand = (b: Brand) => prefs && savePrefs({ ...prefs, brand: { ...brand, ...b } });

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
        <Txt variant="md">Your reel look</Txt>
        <Txt variant="cap">Used in motion reels: your colour for buttons and highlights, and your handle on every reel.</Txt>
        <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {BRAND_COLOURS.map((c) => {
            const selected = (brand.accent ?? "") === c;
            return (
              <Pressable
                key={c || "auto"}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={c ? `Colour ${c}` : "Let AI choose"}
                onPress={() => saveBrand({ accent: c || undefined })}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: c || colors.surfaceSunken,
                  borderWidth: selected ? 3 : 1,
                  borderColor: selected ? colors.ink : colors.lineStrong,
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                {c ? null : <Txt variant="cap">AI</Txt>}
              </Pressable>
            );
          })}
        </View>
        {brand.accent ? (
          <ChipRow<"light" | "dark">
            options={[
              { value: "light", label: "Light background" },
              { value: "dark", label: "Dark background" },
            ]}
            value={brand.background ?? "light"}
            onChange={(background) => saveBrand({ background })}
          />
        ) : null}
        <Field
          label="Handle shown on reels (optional)"
          value={handle}
          onChangeText={(t) => setHandle(t.replace(/\s/g, "").slice(0, 30))}
          onBlur={() => saveBrand({ handle: handle ? (handle.startsWith("@") ? handle : `@${handle}`) : undefined })}
          placeholder="@yourhandle"
          autoCapitalize="none"
        />
      </Card>

      <Card>
        <ListRow icon="link" title="Connected accounts" sub="Instagram, YouTube" onPress={() => router.push("/connections")} />
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
