import Constants from "expo-constants";
import { useEffect, useState } from "react";
import { Linking, Pressable, Switch, View } from "react-native";
import { router } from "expo-router";

import { Avatar } from "@/components/avatar";
import { Banner, Button, Card, ChipRow, Field, Header, ListRow, Row, Screen, Txt } from "@/components/ui";
import { api, type PushKind, type PushPrefs } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { DEMO, PRIVACY_URL, SUPPORT_EMAIL, SUPPORT_URL, TERMS_URL } from "@/lib/config";
import { LANGUAGES } from "@/lib/languages";
import { profileTodo } from "@/lib/profile";
import { type PushPermission, pushPermission, registerForPush } from "@/lib/push";
import { type Brand, useSession } from "@/lib/session";
import { useData } from "@/lib/use-data";
import { useTheme, type Mode } from "@/theme";

// Brand colours offered for motion reels; "" lets the AI pick a theme per reel.
const BRAND_COLOURS = ["", "#e0198a", "#c2410c", "#0a756b", "#2563eb", "#7c3aed", "#111827"];

const PUSH_KINDS: { kind: PushKind; title: string; sub: string }[] = [
  { kind: "songs", title: "Songs", sub: "When a song is ready, or didn't work" },
  { kind: "reels", title: "Reels", sub: "When a reel is ready, or didn't work" },
  { kind: "gifts", title: "Gifts and Jugalbandis", sub: "When someone opens or answers a song you sent, or sings with you" },
  { kind: "remixes", title: "Remixes and earnings", sub: "When someone remixes your song or uses your recipe, at most once a day each" },
];

// Account › Notifications: each kind on or off, saved on the server so every phone follows it.
function NotificationSettings() {
  const { colors } = useTheme();
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [prefs, setPrefs] = useState<PushPrefs | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pushPermission().then(setPermission, () => setPermission("off"));
    api.pushPrefs().then(setPrefs, (e) => setError((e as Error).message));
  }, []);

  async function toggle(kind: PushKind, on: boolean) {
    if (!prefs) return;
    setError(null);
    setPrefs({ ...prefs, [kind]: on });
    try {
      setPrefs(await api.setPushPrefs({ [kind]: on }));
    } catch (err) {
      setPrefs(prefs);
      setError((err as Error).message);
    }
  }

  return (
    <Card>
      <Txt variant="md">Notifications</Txt>
      {permission === "off" ? (
        <Banner kind="warn" text="Notifications are off for Reelkar in iPhone Settings." action={<Button label="Settings" small kind="secondary" onPress={() => Linking.openSettings()} />} />
      ) : permission === "ask" ? (
        <Banner
          kind="info"
          text="Get a notification when a song or reel is ready."
          action={<Button label="Turn on" small kind="secondary" onPress={() => registerForPush(true).catch(() => false).then(() => pushPermission().then(setPermission))} />}
        />
      ) : null}
      {error ? <Banner kind="error" text={error} /> : null}
      {PUSH_KINDS.map((k) => (
        <ListRow
          key={k.kind}
          title={k.title}
          sub={k.sub}
          right={
            <Switch
              accessibilityLabel={`${k.title} notifications`}
              value={prefs?.[k.kind] ?? true}
              disabled={!prefs}
              onValueChange={(on) => toggle(k.kind, on)}
              trackColor={{ true: colors.tealText, false: colors.lineStrong }}
            />
          }
        />
      ))}
    </Card>
  );
}

// Settings › Blocked creators: everyone I blocked, with Unblock. Shown once there's someone in it.
function BlockedCreators() {
  const blocks = useData(() => api.blocks());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function unblock(userId: string) {
    setBusy(userId);
    setError(null);
    try {
      await api.unblockUser(userId);
      await blocks.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!blocks.data?.length && !blocks.error) return null;
  return (
    <Card>
      <Txt variant="md">Blocked creators</Txt>
      <Txt variant="cap">You don&apos;t see their songs, recipes or remixes, and their gifts and Jugalbandi invites don&apos;t reach you.</Txt>
      {blocks.error ? <Banner kind="error" text={blocks.error} action={<Button label="Retry" small kind="secondary" onPress={blocks.reload} />} /> : null}
      {error ? <Banner kind="error" text={error} /> : null}
      {(blocks.data ?? []).map((b) => (
        <ListRow key={b.userId} icon="ban" title={b.name} right={<Button label="Unblock" small kind="secondary" loading={busy === b.userId} onPress={() => unblock(b.userId)} />} />
      ))}
    </Card>
  );
}

export default function Account() {
  const { user, prefs, savePrefs, signOut } = useSession();
  const { preference, setPreference, colors } = useTheme();
  const profile = useData(() => api.profile());
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
      <Header title="Settings" back />
      <Card onPress={() => router.push("/edit-profile")}>
        <Row style={{ gap: 14 }}>
          <Avatar avatar={profile.data?.avatar} name={profile.data?.name || user?.name} />
          <View style={{ flex: 1 }}>
            <Txt variant="md">{profile.data?.name || user?.name || "Creator"}</Txt>
            <Txt variant="cap">{profile.data?.handle ? `@${profile.data.handle}` : prefs?.topic ?? "Creator"}</Txt>
          </View>
          <Txt variant="label" color="tealText">
            Edit profile
          </Txt>
        </Row>
      </Card>
      {profile.data && !profile.data.complete ? (
        <Banner
          kind="info"
          title="Finish your profile"
          text={`${profileTodo(profile.data.missing)}, so people know who made your songs.`}
          action={<Button label="Finish" small kind="secondary" onPress={() => router.push("/edit-profile")} />}
        />
      ) : null}

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

      <NotificationSettings />

      <BlockedCreators />

      <Card>
        {/* Connected accounts, credits, reels and earnings live on the You tab. */}
        {SUPPORT_EMAIL ? (
          <ListRow
            icon="send"
            title="Send feedback"
            sub={SUPPORT_EMAIL}
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Reelkar%20feedback`).catch(() => undefined)}
          />
        ) : null}
        <ListRow icon="lock" title="Privacy policy" onPress={() => Linking.openURL(PRIVACY_URL).catch(() => undefined)} />
        <ListRow icon="flag" title="Terms and community rules" onPress={() => Linking.openURL(TERMS_URL).catch(() => undefined)} />
        <ListRow icon="send" title="Help and support" onPress={() => Linking.openURL(SUPPORT_URL).catch(() => undefined)} />
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
