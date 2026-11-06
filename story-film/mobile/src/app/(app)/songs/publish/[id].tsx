import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Share, Switch, View } from "react-native";

import { Avatar } from "@/components/avatar";
import { RemixCredit } from "@/components/remix-family";
import { SongCover } from "@/components/song-cover";
import { Banner, Button, Card, ChipRow, Field, Header, Row, Screen, Skeleton, Txt, Win } from "@/components/ui";
import { api, ApiError, type SongListen } from "@/lib/api";
import { handleHint } from "@/lib/listen";
import { genreLabel } from "@/lib/songs";
import { useData } from "@/lib/use-data";
import { useTheme } from "@/theme";

type Step = "handle" | "publish" | "done";

// Put a song on Listen: pick a handle the first time, then title, lyrics and remix choices.
// The usual song safety check runs again; if it fails the song stays private and we say why.
export default function PublishSong() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const song = useData(() => api.song(id));
  const me = useData(() => api.handle());
  // The profile photo shows next to the handle, as it will on Listen.
  const profile = useData(() => api.profile());
  const [stepChoice, setStep] = useState<Step | null>(null);
  const [handleInput, setHandle] = useState<string | null>(null);
  const [check, setCheck] = useState<{ handle: string; ok: boolean; problem: string | null } | null>(null);
  const [titleInput, setTitle] = useState<string | null>(null);
  const [showLyrics, setShowLyrics] = useState(true);
  const [allowRemix, setAllowRemix] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SongListen | null>(null);
  const s = song.data;
  // The first step depends on whether there's a handle yet; fields start from the song and suggestions.
  const step: Step | null = stepChoice ?? (me.data && s ? (me.data.handle ? "publish" : "handle") : null);
  const handle = handleInput ?? me.data?.suggestions[0] ?? "";
  const title = titleInput ?? s?.title ?? "";

  // Checks the handle with the server once typing pauses.
  const clean = handle.trim().toLowerCase().replace(/^@/, "");
  const hint = handleHint(clean);
  useEffect(() => {
    if (step !== "handle" || !clean || hint) return;
    const t = setTimeout(() => api.checkHandle(clean).then(setCheck, () => undefined), 400);
    return () => clearTimeout(t);
  }, [clean, hint, step]);
  const checked = check?.handle === clean ? check : null;

  async function saveHandle() {
    setBusy(true);
    setError(null);
    try {
      await api.setHandle(clean);
      me.reload();
      setStep("publish");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.publishSong(id, { title: title.trim() || undefined, showLyrics, allowRemix: allowRemix && !s?.myVoice }));
      setStep("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Your song is still private.");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!result?.publicId) return;
    const link = api.publicSongLink(result.publicId);
    await Share.share({ message: `Listen to my song “${title}” on Reelkar ${link}`, url: link }).catch(() => undefined);
  }

  const handleNow = me.data?.handle ?? clean;
  return (
    <Screen>
      <Header title={step === "handle" ? "Pick your handle" : step === "done" ? "It's on Listen" : "Share on Listen"} sub={s ? s.title : undefined} back />
      {song.error || me.error ? <Banner kind="error" text={song.error ?? me.error ?? ""} /> : null}
      {!step || !s ? (
        <Skeleton height={240} />
      ) : step === "handle" ? (
        <>
          <Txt>This is the name people see on your public songs, and your profile username. You can change it once a month.</Txt>
          <Field label="Handle" value={handle} onChangeText={(v) => setHandle(v.replace(/\s/g, ""))} autoCapitalize="none" autoCorrect={false} maxLength={21} placeholder="priya.sings" />
          {hint ? (
            <Txt variant="cap" color="coralText">
              {hint}
            </Txt>
          ) : checked ? (
            <Txt variant="cap" color={checked.ok ? "tealText" : "coralText"}>
              {checked.ok ? `@${clean} is free` : checked.problem}
            </Txt>
          ) : null}
          {me.data?.suggestions.length ? <ChipRow options={me.data.suggestions.map((h) => ({ value: h, label: `@${h}` }))} value={clean} onChange={setHandle} /> : null}
          {error ? <Banner kind="error" text={error} /> : null}
          <Button label="Continue" block disabled={!clean || Boolean(hint) || checked?.ok === false} loading={busy} onPress={saveHandle} />
        </>
      ) : step === "publish" ? (
        <>
          <Row style={{ alignItems: "center", gap: 12 }}>
            <SongCover song={s} size={72} />
            <View style={{ flex: 1 }}>
              <Row style={{ alignItems: "center", gap: 8 }}>
                <Avatar avatar={profile.data?.avatar} name={profile.data?.name} size={24} />
                <Txt variant="label">{`@${handleNow}`}</Txt>
              </Row>
              <Txt variant="cap">{genreLabel(s.genre)}</Txt>
            </View>
          </Row>
          {profile.data && !profile.data.avatar ? (
            <Banner kind="info" text="Add a profile photo so listeners know it's you." action={<Button label="Add photo" small kind="secondary" onPress={() => router.push("/edit-profile")} />} />
          ) : null}
          {s.remixOf ? <RemixCredit remixOf={s.remixOf} /> : null}
          <Field label="Title" value={title} onChangeText={setTitle} maxLength={80} />
          <Card flat>
            <Row style={{ alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Txt variant="label">Show lyrics</Txt>
                <Txt variant="cap">Listeners see the words on the song page.</Txt>
              </View>
              <Switch accessibilityLabel="Show lyrics" value={showLyrics} onValueChange={setShowLyrics} trackColor={{ true: colors.teal, false: colors.lineStrong }} />
            </Row>
            {s.myVoice ? (
              <Txt variant="cap">This is sung in your own voice, so others can&apos;t remix it. It&apos;s labelled “Sung in your own voice”.</Txt>
            ) : (
              <Row style={{ alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Txt variant="label">Allow remixes</Txt>
                  <Txt variant="cap">Others can make a cover or remix. You&apos;re always credited.</Txt>
                </View>
                <Switch accessibilityLabel="Allow remixes" value={allowRemix} onValueChange={setAllowRemix} trackColor={{ true: colors.teal, false: colors.lineStrong }} />
              </Row>
            )}
          </Card>
          <Txt variant="cap">Everyone can listen, like and share it. It&apos;s marked Made with AI. You can make it private again any time.</Txt>
          {error ? <Banner kind="error" text={error} /> : null}
          <Button label="Publish song" icon="globe" block loading={busy} onPress={publish} />
        </>
      ) : (
        <>
          <Win text={`“${title}” is on Listen as @${handleNow}`} />
          <Button label="Share link" icon="share" block onPress={share} />
          <Button label="See it on Listen" kind="secondary" block onPress={() => result?.publicId && router.replace({ pathname: "/s/[id]", params: { id: result.publicId } })} />
          <Button label="Done" kind="ghost" block onPress={() => router.back()} />
        </>
      )}
    </Screen>
  );
}
