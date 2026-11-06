import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Avatar } from "@/components/avatar";
import { Banner, Button, ChipRow, Field, Txt } from "@/components/ui";
import { api, ApiError, type Profile, type ProfileInput } from "@/lib/api";
import { AVATAR_PRESETS } from "@/lib/avatars";
import { handleHint } from "@/lib/listen";
import { useTheme } from "@/theme";

type Photo = { uri: string; name: string; type: string };
type Errors = Partial<Record<"name" | "handle" | "photo" | "form", string>>;

// The profile form's state, shared by onboarding's "Your profile" step and Account › Edit profile.
// Every field is optional: whatever is filled in is saved, the rest waits for later.
export function useProfileForm(profile: Profile | null) {
  const [name, setName] = useState<string | null>(null);
  const [handleInput, setHandleInput] = useState<string | null>(null);
  const [preset, setPreset] = useState<string | null | undefined>(undefined);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [ideas, setIdeas] = useState<string[] | null>(null);
  const [check, setCheck] = useState<{ handle: string; ok: boolean; problem: string | null } | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const nameNow = name ?? profile?.name ?? "";
  // The handle can only change every 30 days; until then it's shown, not edited.
  const locked = Boolean(profile?.handle && profile.canChangeAt && new Date(profile.canChangeAt) > new Date());
  const suggestions = profile?.handle ? [] : (ideas ?? profile?.suggestions ?? []);
  // Like publishing: start from the first idea once there's a name to make it from.
  const handle = handleInput ?? profile?.handle ?? (nameNow.trim() ? (suggestions[0] ?? "") : "");
  const clean = handle.trim().toLowerCase().replace(/^@/, "");
  const hint = handleHint(clean);
  const changedHandle = Boolean(clean) && clean !== profile?.handle;
  const checked = check?.handle === clean ? check : null;
  const presetNow = preset === undefined ? (profile?.avatar?.preset ?? null) : preset;

  // Fresh @handle ideas from the name being typed (only while there's no handle yet).
  useEffect(() => {
    if (!profile || profile.handle || name === null || !name.trim()) return;
    const t = setTimeout(() => api.handleIdeas(name.trim()).then(setIdeas, () => undefined), 500);
    return () => clearTimeout(t);
  }, [name, profile]);

  // Checks the handle with the server once typing pauses.
  useEffect(() => {
    if (!changedHandle || hint || locked) return;
    const t = setTimeout(() => api.checkHandle(clean).then(setCheck, () => undefined), 400);
    return () => clearTimeout(t);
  }, [clean, changedHandle, hint, locked]);

  async function pickPhoto() {
    setErrors((e) => ({ ...e, photo: undefined }));
    // iPhone photos are HEIC, which the server doesn't take; "compatible" hands over a JPEG copy.
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (r.canceled || !r.assets.length) return;
    const a = r.assets[0];
    const type = a.mimeType ?? "image/jpeg";
    setPhoto({ uri: a.uri, name: a.fileName ?? `profile-${Date.now()}.${type === "image/png" ? "png" : "jpg"}`, type });
    setPreset(null);
  }

  function pickPreset(key: string) {
    setPhoto(null);
    setPreset(key);
  }

  // Saves what changed; resolves to the saved profile, or null when something needs fixing.
  async function save(): Promise<Profile | null> {
    if (!profile) return null;
    setBusy(true);
    setErrors({});
    try {
      let saved = profile;
      if (photo) saved = await api.uploadProfilePhoto(photo);
      const input: ProfileInput = {};
      if (nameNow.trim() && nameNow.trim() !== profile.name) input.name = nameNow.trim();
      if (changedHandle && !locked) input.handle = clean;
      if (!photo && presetNow && presetNow !== profile.avatar?.preset) input.avatar = presetNow;
      if (Object.keys(input).length) saved = await api.saveProfile(input);
      setPhoto(null);
      return saved;
    } catch (err) {
      const field = err instanceof ApiError && err.field && ["name", "handle", "photo"].includes(err.field) ? (err.field as keyof Errors) : "form";
      setErrors({ [field]: (err as Error).message });
      return null;
    } finally {
      setBusy(false);
    }
  }

  return {
    profile,
    name: nameNow,
    setName,
    handle,
    clean,
    setHandle: (v: string) => setHandleInput(v.replace(/\s/g, "")),
    hint,
    checked,
    changedHandle,
    locked,
    suggestions,
    preset: presetNow,
    pickPreset,
    photo,
    pickPhoto,
    errors,
    busy,
    // Save stays possible with an empty handle (skipped), not with one that can't be used.
    canSave: Boolean(profile) && !(changedHandle && (hint || checked?.ok === false)),
    save,
  };
}

export type ProfileForm = ReturnType<typeof useProfileForm>;

export function ProfileFields({ form }: { form: ProfileForm }) {
  const { colors } = useTheme();
  const p = form.profile;
  const shownAvatar = form.photo ? null : form.preset ? { preset: form.preset } : (p?.avatar ?? null);
  const handleStatus = form.locked
    ? `You can change your username again on ${new Date(p!.canChangeAt!).toLocaleDateString(undefined, { day: "numeric", month: "short" })}.`
    : form.errors.handle
      ? form.errors.handle
      : !form.changedHandle
        ? p?.handle
          ? "Your username on Listen and Jugalbandis."
          : "Unique to you. Shown on songs you share."
        : (form.hint ?? (form.checked ? (form.checked.ok ? `@${form.clean} is free` : form.checked.problem) : "Checking…"));
  const handleBad = Boolean(form.errors.handle || (form.changedHandle && (form.hint || form.checked?.ok === false)));

  return (
    <View style={{ gap: 18 }}>
      {form.errors.form ? <Banner kind="error" text={form.errors.form} /> : null}

      <View style={{ alignItems: "center", gap: 10 }}>
        <Avatar avatar={shownAvatar} localUri={form.photo?.uri} name={form.name} size={96} />
        <Button label={form.photo || p?.avatar?.url ? "Choose another photo" : "Upload a photo"} icon="camera" kind="secondary" small style={{ alignSelf: "center" }} onPress={form.pickPhoto} />
        {form.errors.photo ? (
          <Txt variant="cap" color="danger">
            {form.errors.photo}
          </Txt>
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        <Txt variant="cap">Or pick an avatar</Txt>
        <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {AVATAR_PRESETS.map((a) => {
            const selected = !form.photo && form.preset === a.key;
            return (
              <Pressable
                key={a.key}
                accessibilityRole="radio"
                accessibilityLabel={a.label}
                accessibilityState={{ checked: selected }}
                onPress={() => form.pickPreset(a.key)}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: a.bg,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: selected ? 3 : 0,
                  borderColor: colors.ink,
                }}>
                <Text style={{ fontSize: 26 }} allowFontScaling={false}>
                  {a.emoji}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <Field
          label="Your name"
          value={form.name}
          onChangeText={form.setName}
          placeholder="Priya Sharma"
          maxLength={40}
          autoComplete="name"
          textContentType="name"
          autoCapitalize="words"
          returnKeyType="next"
        />
        {form.errors.name ? (
          <Txt variant="cap" color="danger">
            {form.errors.name}
          </Txt>
        ) : null}
      </View>

      <View style={{ gap: 6 }}>
        {form.locked ? (
          <View style={{ gap: 6 }}>
            <Txt variant="cap">Username</Txt>
            <Txt variant="label">{`@${p!.handle}`}</Txt>
          </View>
        ) : (
          <Field
            label="Username"
            value={form.handle}
            onChangeText={form.setHandle}
            placeholder="priya.sings"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            maxLength={21}
          />
        )}
        <Txt variant="cap" color={handleBad ? "danger" : form.changedHandle && form.checked?.ok ? "tealText" : undefined}>
          {handleStatus ?? ""}
        </Txt>
        {!form.locked && form.suggestions.length ? (
          <ChipRow options={form.suggestions.map((h) => ({ value: h, label: `@${h}` }))} value={form.clean} onChange={form.setHandle} />
        ) : null}
      </View>
    </View>
  );
}
