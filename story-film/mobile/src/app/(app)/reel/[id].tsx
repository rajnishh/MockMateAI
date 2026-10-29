import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useState } from "react";
import { Share, StyleSheet, View } from "react-native";

import { ReelThumb } from "@/components/reel-thumb";
import { Banner, Button, Card, ChipRow, Header, Row, Screen, Skeleton, Txt } from "@/components/ui";
import { api, type Film, type Platform, type PostCopy } from "@/lib/api";
import { radius } from "@/theme";

export default function Reel() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [film, setFilm] = useState<Film | null>(null);
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [copy, setCopy] = useState<Record<string, PostCopy>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [headers, setHeaders] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    api.film(id).then(setFilm, (e) => setError(e.message));
    api.videoHeaders().then(setHeaders);
  }, [id]);

  const url = film ? api.videoUrl(film) : null;
  // The video needs the session cookie, so wait for it before creating the source.
  const player = useVideoPlayer(url && headers ? { uri: url, headers } : null, (p) => {
    p.loop = true;
  });

  async function writeCaption() {
    setBusy(true);
    setError(null);
    try {
      const c = await api.caption(id, platform);
      setCopy((all) => ({ ...all, [platform]: c }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const current = copy[platform];
  const text = current ? [current.caption, current.hashtags.join(" ")].filter(Boolean).join("\n\n") : "";

  return (
    <Screen>
      <Header title={film?.title ?? "Your reel"} sub="Ready · Made with AI" back />
      <View style={styles.player}>
        {url && headers ? <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls /> : film ? <ReelThumb seed={0} playable /> : <Skeleton height={420} />}
      </View>
      {error ? <Banner kind="error" text={error} /> : null}
      <Card>
        <Txt variant="md">Caption</Txt>
        <ChipRow<Platform>
          options={[
            { value: "instagram", label: "Instagram" },
            { value: "youtube", label: "YouTube" },
            { value: "whatsapp", label: "WhatsApp" },
          ]}
          value={platform}
          onChange={setPlatform}
        />
        {current ? (
          <>
            {platform === "youtube" ? <Txt variant="label">{current.title}</Txt> : null}
            <Txt selectable>{text}</Txt>
            <Row>
              <Button label="Copy caption" small kind="secondary" icon="link" onPress={() => Clipboard.setStringAsync(text).then(() => setNote("Caption copied"))} />
              <Button label="Write again" small kind="ghost" icon="refresh" onPress={writeCaption} />
            </Row>
          </>
        ) : (
          <Button label="Write my caption" icon="sparkle" kind="tweak" loading={busy} onPress={writeCaption} />
        )}
      </Card>
      {note ? <Banner kind="info" text={note} /> : null}
      <Button
        label="Share"
        icon="send"
        block
        onPress={() => Share.share({ message: [film?.title, text, url].filter(Boolean).join("\n\n") }).catch(() => undefined)}
      />
      <Txt variant="cap" style={{ textAlign: "center" }}>
        Posting straight to Instagram and YouTube comes in the next beta.
      </Txt>
      <Button label="Make another reel" kind="secondary" block onPress={() => router.replace("/create")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  player: { width: "70%", maxWidth: 320, aspectRatio: 9 / 16, alignSelf: "center", borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#0b1220" },
});
