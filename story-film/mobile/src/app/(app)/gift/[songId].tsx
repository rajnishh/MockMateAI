import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Icon } from "@/components/icon";
import { SongCover } from "@/components/song-cover";
import { Banner, Button, Card, ChipRow, Field, Header, Hero, Screen, Skeleton, Status, Txt, Win } from "@/components/ui";
import { api, type Gift, type Occasion } from "@/lib/api";
import { copyLink, giftMessage, guessOccasion, OCCASIONS, occasionLabel, sendOnWhatsApp, shareMore, signName } from "@/lib/gifts";
import { useSession } from "@/lib/session";
import { useData } from "@/lib/use-data";
import { radius, useTheme } from "@/theme";

type Cover = "song" | "photo";
type Address = "her" | "him" | "none";

// The Arabic gift page says "افتحي هديتك" or "افتح هديتك"; asked only of people using Arabic.
const arabicPhone = /^ar\b/.test(Intl.DateTimeFormat().resolvedOptions().locale);
const ARABIC = /[؀-ۿ]/;

// "Make it a gift": who it's for, the occasion, a note and a cover, then a link to send on WhatsApp.
// Gifts are free. Design: story-film/design/community/flow-spec.md (G2, G3).
export default function MakeGift() {
  const { songId } = useLocalSearchParams<{ songId: string }>();
  const { colors } = useTheme();
  const song = useData(() => api.song(songId));
  const { user } = useSession();
  const [toName, setToName] = useState("");
  const [fromName, setFromName] = useState(() => signName(user?.name));
  const [occasion, setOccasion] = useState<Occasion | null>(null);
  const [note, setNote] = useState("");
  const [cover, setCover] = useState<Cover>("song");
  const [photo, setPhoto] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [address, setAddress] = useState<Address>("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gift, setGift] = useState<Gift | null>(null);
  const [copied, setCopied] = useState(false);

  const s = song.data;
  const picked = occasion ?? guessOccasion(s?.title ?? "");
  const askAddress = arabicPhone || ARABIC.test(toName + note);

  async function pickPhoto() {
    setError(null);
    // iPhone photos are HEIC, which the server doesn't take; "compatible" hands over a JPEG copy.
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (r.canceled || !r.assets.length) return;
    const a = r.assets[0];
    const type = a.mimeType ?? "image/jpeg";
    setPhoto({ uri: a.uri, name: a.fileName ?? `cover-${Date.now()}.${type === "image/png" ? "png" : "jpg"}`, type });
    setCover("photo");
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const photoId = cover === "photo" && photo ? await api.uploadPhoto(photo) : undefined;
      const g = await api.createGift(songId, { toName: toName.trim(), fromName: fromName.trim(), occasion: picked, note: note.trim(), photo: photoId, address: address === "none" ? null : address });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setGift(g);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (gift) {
    const text = giftMessage(gift.toName, gift.occasion, gift.url);
    return (
      <Screen
        footer={
          <>
            <Button label="Send on WhatsApp" icon="send" block onPress={() => sendOnWhatsApp(text).catch((e) => setError((e as Error).message))} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button
                label={copied ? "Copied" : "Copy link"}
                icon={copied ? "check" : "link"}
                kind="secondary"
                style={{ flex: 1 }}
                onPress={() => copyLink(gift.url).then(() => setCopied(true))}
              />
              <Button label="More" icon="share" kind="secondary" style={{ flex: 1 }} onPress={() => shareMore(text, gift.url).catch(() => undefined)} />
            </View>
            <Button label="Done" kind="ghost" block onPress={() => router.back()} />
          </>
        }>
        <Header title="Your gift is ready" back />
        <Win text={`A ${occasionLabel(gift.occasion).toLowerCase()} song for ${gift.toName}`} icon="gift" />
        <Card>
          <Txt variant="cap">The message (you can change it in WhatsApp)</Txt>
          <Txt>{text}</Txt>
        </Card>
        <Status kind="ok" text="You'll see in Inbox when it's opened, and when they reply." />
        {!gift.songReady ? <Status kind="making" text="The song is still being made. The link shows “almost ready” until it is." /> : null}
        {error ? <Banner kind="error" text={error} /> : null}
      </Screen>
    );
  }

  return (
    <Screen footer={<Button label="Create gift link" icon="link" block disabled={!toName.trim() || !fromName.trim() || !s} loading={busy} onPress={create} />}>
      <Header title="Make it a gift" back />
      {song.error ? <Banner kind="error" text={song.error} /> : null}
      {!s ? (
        <Skeleton height={160} />
      ) : (
        <Hero>
          <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
            {cover === "photo" && photo ? <Image source={{ uri: photo.uri }} style={styles.preview} accessibilityIgnoresInvertColors /> : <SongCover song={s} size={92} radius={radius.lg} />}
            <View style={{ flex: 1, gap: 4 }}>
              <Txt variant="cap" color="onBrandMuted">
                {occasionLabel(picked)}
              </Txt>
              <Txt variant="md" color="onBrand">
                {picked === "just_because" ? "A song" : `A ${occasionLabel(picked).toLowerCase()} song`} for {toName.trim() || "…"}
              </Txt>
              <Txt variant="cap" color="onBrandMuted">
                From {fromName.trim() || "…"} · Made with AI
              </Txt>
            </View>
          </View>
        </Hero>
      )}
      <Field label="Who is it for?" placeholder="Priya" value={toName} onChangeText={setToName} maxLength={40} autoCapitalize="words" returnKeyType="next" />
      <Field label="From (they'll see this name)" placeholder="Rajnish, Bhaiya, Mom…" value={fromName} onChangeText={setFromName} maxLength={40} autoCapitalize="words" />
      <View style={{ gap: 6 }}>
        <Txt variant="cap">Occasion</Txt>
        <ChipRow options={OCCASIONS.map((o) => ({ value: o.value, label: o.label }))} value={picked} onChange={setOccasion} />
      </View>
      {askAddress ? (
        <View style={{ gap: 6 }}>
          <Txt variant="cap">نخاطبها أم نخاطبه؟ (Arabic page)</Txt>
          <ChipRow
            options={[
              { value: "her", label: "لها" },
              { value: "him", label: "له" },
              { value: "none", label: "بلا تحديد" },
            ]}
            value={address}
            onChange={setAddress}
          />
        </View>
      ) : null}
      <View style={{ gap: 4 }}>
        <Field label="Add a note (optional)" placeholder="Happy birthday! Play it loud." value={note} onChangeText={setNote} maxLength={200} multiline />
        <Txt variant="cap" style={{ textAlign: "right" }}>
          {note.length} / 200
        </Txt>
      </View>
      <View style={{ gap: 8 }}>
        <Txt variant="cap">Cover picture</Txt>
        <View style={{ flexDirection: "row", gap: 12 }}>
          {s ? (
            <CoverTile label="Song cover" selected={cover === "song"} onPress={() => setCover("song")}>
              <SongCover song={s} size={72} radius={18} />
            </CoverTile>
          ) : null}
          <CoverTile label={photo ? "My photo" : "Choose photo"} selected={cover === "photo"} onPress={photo ? () => setCover("photo") : pickPhoto} onLongPress={pickPhoto}>
            {photo ? (
              <Image source={{ uri: photo.uri }} style={styles.tileImg} accessibilityIgnoresInvertColors />
            ) : (
              <View style={[styles.tileImg, { backgroundColor: colors.surfaceSunken, alignItems: "center", justifyContent: "center" }]}>
                <Icon name="camera" color={colors.inkMuted} />
              </View>
            )}
          </CoverTile>
        </View>
      </View>
      <Txt variant="cap">Free · anyone with the link can play it. You can stop sharing any time.</Txt>
      {s?.myVoice ? <Status kind="ok" text="Sung in your own voice. People can play it, but nobody can re-sing in your voice." /> : null}
      {error ? <Banner kind="error" text={error} /> : null}
    </Screen>
  );
}

function CoverTile({ label, selected, onPress, onLongPress, children }: { label: string; selected: boolean; onPress: () => void; onLongPress?: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={label} style={{ alignItems: "center", gap: 6, minWidth: 88 }}>
      <View style={[styles.tile, selected && { borderColor: colors.action }]}>
        {children}
        {selected ? (
          <View style={[styles.badge, { backgroundColor: colors.action }]}>
            <Icon name="check" size={14} color={colors.onAction} />
          </View>
        ) : null}
      </View>
      <Txt variant="cap">{label}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  preview: { width: 92, height: 92, borderRadius: radius.lg },
  tile: { borderWidth: 3, borderColor: "transparent", borderRadius: 22, padding: 2 },
  tileImg: { width: 72, height: 72, borderRadius: 18 },
  badge: { position: "absolute", top: -6, right: -6, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
