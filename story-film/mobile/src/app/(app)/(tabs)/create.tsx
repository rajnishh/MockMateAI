import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Banner, Button, Card, ChipRow, Credits, Field, Header, ListRow, Row, Screen, Txt } from "@/components/ui";
import { api, ApiError, type Idea } from "@/lib/api";
import { LANGUAGES } from "@/lib/languages";
import { useSession } from "@/lib/session";
import { INDIAN_ART, LOOKS, type Style } from "@/lib/styles";
import { useData } from "@/lib/use-data";

type Kind = "story" | "motion" | "edit";
type Ending = "auto" | "none" | "follow" | "comment";
type Picked = { uri: string; name: string; type: string; seconds: number | null; mb: number | null };

// Same limit as the server: the free plan's 60-second reels.
const MAX_EDIT_SEC = 60;

export default function Create() {
  const { prefs } = useSession();
  const billing = useData(() => api.billing());
  const [kind, setKind] = useState<Kind>("story");
  const [ending, setEnding] = useState<Ending>("auto");
  const [keyword, setKeyword] = useState("");
  const [style, setStyle] = useState<Style>("animated");
  const [story, setStory] = useState("");
  const [language, setLanguage] = useState(prefs?.language ?? "hi");
  const [length, setLength] = useState("30");
  const [quality, setQuality] = useState<"standard" | "premium">("standard");
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [video, setVideo] = useState<Picked | null>(null);
  const [captions, setCaptions] = useState<"on" | "off">("on");
  const [zooms, setZooms] = useState<"on" | "off">("on");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; credits: boolean } | null>(null);

  const durationSec = Number(length);
  const perShot = billing.data?.premiumCreditsPerShot ?? 12;
  const premiumCost = Math.round(durationSec / 5) * perShot;
  const motion = kind === "motion";
  const editing = kind === "edit";
  const tooLong = Boolean(video?.seconds && video.seconds > MAX_EDIT_SEC + 0.5);
  const blocked = editing ? !video || tooLong : story.trim().length < 20;
  const keywordValue = ending === "comment" && keyword.trim() ? keyword.trim().toUpperCase() : undefined;

  async function getIdeas() {
    setIdeasBusy(true);
    try {
      setIdeas(await api.ideas(prefs?.topic ?? "", language));
    } catch (err) {
      setError({ text: (err as Error).message, credits: false });
    } finally {
      setIdeasBusy(false);
    }
  }

  async function pickVideo() {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], allowsEditing: false, videoMaxDuration: MAX_EDIT_SEC });
    if (result.canceled || !result.assets.length) return;
    const a = result.assets[0];
    setVideo({
      uri: a.uri,
      name: a.fileName ?? `video-${Date.now()}.mp4`,
      type: a.mimeType ?? "video/mp4",
      seconds: a.duration ? a.duration / 1000 : null,
      mb: a.fileSize ? a.fileSize / 1048576 : null,
    });
  }

  async function make() {
    setBusy(true);
    setError(null);
    try {
      const { id } = editing
        ? await api.uploadEdit({
            video: { uri: video!.uri, name: video!.name, type: video!.type },
            language,
            captions: captions === "on",
            zooms: zooms === "on",
            ending,
            keyword: keywordValue,
            brand: prefs?.brand,
          })
        : await api.createFilm({
            story: story.trim(),
            language,
            durationSec,
            quality: motion ? "standard" : quality,
            style,
            format: kind === "motion" ? "motion" : "story",
            ...(motion ? { ending, keyword: keywordValue, brand: prefs?.brand } : {}),
          });
      setStory("");
      setVideo(null);
      router.push(`/making/${id}`);
    } catch (err) {
      setError({ text: (err as Error).message, credits: err instanceof ApiError && err.needCredits });
    } finally {
      setBusy(false);
    }
  }

  const endingPicker = (
    <View style={{ gap: 6 }}>
      <Txt variant="cap">Ending</Txt>
      <ChipRow<Ending>
        options={[
          { value: "auto", label: "Let AI decide" },
          { value: "none", label: "No ending ask" },
          { value: "follow", label: "Ask to follow" },
          { value: "comment", label: "Ask to comment a word" },
        ]}
        value={ending}
        onChange={setEnding}
      />
      {ending === "comment" ? (
        <Field label="Word to comment (optional)" value={keyword} onChangeText={(t) => setKeyword(t.replace(/\s/g, "").slice(0, 20))} placeholder="GUIDE" autoCapitalize="characters" />
      ) : null}
      <Button
        label={prefs?.brand?.accent || prefs?.brand?.handle ? "Using your brand look · change" : "Add your brand colour and handle"}
        kind="ghost"
        icon="edit"
        onPress={() => router.push("/account")}
        style={{ paddingHorizontal: 0 }}
      />
    </View>
  );

  return (
    <Screen
      footer={
        <>
          <Button
            label={editing ? (busy ? "Uploading…" : "Edit my video") : quality === "premium" && !motion ? `Make my reel · ${premiumCost} credits` : "Make my reel"}
            icon="sparkle"
            block
            disabled={blocked}
            loading={busy}
            onPress={make}
          />
          <Txt variant="cap" style={{ textAlign: "center" }}>
            {editing
              ? video
                ? tooLong
                  ? `Pick a video up to ${MAX_EDIT_SEC} seconds`
                  : "About as long as your video to edit · you can leave this screen"
                : "Choose a video you filmed"
              : blocked
                ? "Write at least 20 characters, or pick an idea"
                : "About 2 minutes · you can leave this screen"}
          </Txt>
        </>
      }>
      <Header title="Make a reel" right={<Credits count={billing.data?.balance ?? null} />} />
      {error ? (
        <Banner
          kind="error"
          title={error.credits ? "Not enough credits" : undefined}
          text={error.text}
          action={error.credits ? <Button label="Get credits" small onPress={() => router.push("/credits")} /> : undefined}
        />
      ) : null}
      <View style={{ gap: 6 }}>
        <Txt variant="cap">What do you want to make?</Txt>
        <ChipRow<Kind>
          options={[
            { value: "story", label: "Story with pictures" },
            { value: "motion", label: "Motion reel · text and graphics" },
            { value: "edit", label: "Edit my video" },
          ]}
          value={kind}
          onChange={setKind}
        />
        {motion ? <Txt variant="cap">Tips, lists, numbers and quotes animated on screen with a voice-over. Uses your free weekly reels.</Txt> : null}
        {editing ? <Txt variant="cap">Upload a video you filmed. We add captions in your language, zooms on key moments and cards for your main points.</Txt> : null}
      </View>

      {editing ? (
        <>
          <Card>
            {video ? (
              <>
                <Txt variant="label" numberOfLines={1}>
                  {video.name}
                </Txt>
                <Txt variant="cap" color={tooLong ? "danger" : "inkMuted"}>
                  {[video.seconds ? `${Math.round(video.seconds)} s` : null, video.mb ? `${video.mb.toFixed(1)} MB` : null].filter(Boolean).join(" · ") || "Ready to upload"}
                  {tooLong ? ` · trim it to ${MAX_EDIT_SEC} s first` : ""}
                </Txt>
                <Button label="Choose another video" small kind="secondary" onPress={pickVideo} />
              </>
            ) : (
              <>
                <Txt variant="md">Choose a video</Txt>
                <Txt variant="cap">Vertical videos of you talking work best. Up to {MAX_EDIT_SEC} seconds.</Txt>
                <Button label="Choose from gallery" icon="film" onPress={pickVideo} />
              </>
            )}
          </Card>
          <View style={{ gap: 6 }}>
            <Txt variant="cap">Language you speak in the video</Txt>
            <ChipRow options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} value={language} onChange={setLanguage} />
          </View>
          <Row style={{ gap: 16, alignItems: "flex-start" }}>
            <View style={{ gap: 6 }}>
              <Txt variant="cap">Captions</Txt>
              <ChipRow<"on" | "off">
                options={[
                  { value: "on", label: "On" },
                  { value: "off", label: "Off" },
                ]}
                value={captions}
                onChange={setCaptions}
              />
            </View>
            <View style={{ gap: 6 }}>
              <Txt variant="cap">Zooms</Txt>
              <ChipRow<"on" | "off">
                options={[
                  { value: "on", label: "On" },
                  { value: "off", label: "Off" },
                ]}
                value={zooms}
                onChange={setZooms}
              />
            </View>
          </Row>
          {endingPicker}
        </>
      ) : (
        <>
          {motion ? endingPicker : null}
          {motion ? null : (
            <>
              <View style={{ gap: 6 }}>
                <Txt variant="cap">Look</Txt>
                <ChipRow<Style> options={[...LOOKS]} value={style} onChange={setStyle} />
              </View>
              <View style={{ gap: 6 }}>
                <Txt variant="cap">Indian art</Txt>
                <ChipRow<Style> options={[...INDIAN_ART]} value={style} onChange={setStyle} />
              </View>
            </>
          )}
          <Field label="Your idea or story" value={story} onChangeText={setStory} multiline maxLength={2000} placeholder="Mia finds colours in the puddles after the rain…" />
          <Button label={ideasBusy ? "Finding ideas…" : "Give me ideas for my topic"} kind="ghost" icon="sparkle" disabled={ideasBusy} onPress={getIdeas} style={{ paddingHorizontal: 0 }} />
          {ideas ? (
            <Card flat>
              {ideas.map((i) => (
                <ListRow key={i.title} title={i.title} sub={i.idea} right={<Button label="Use" small kind="secondary" onPress={() => (setStory(`${i.title}. ${i.idea}`), setIdeas(null))} />} />
              ))}
            </Card>
          ) : null}
          <View style={{ gap: 6 }}>
            <Txt variant="cap">Voice and captions</Txt>
            <ChipRow options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} value={language} onChange={setLanguage} />
          </View>
          <View style={{ gap: 6 }}>
            <Txt variant="cap">Length</Txt>
            <ChipRow
              options={[
                { value: "15", label: "15 s" },
                { value: "30", label: "30 s" },
                { value: "60", label: "60 s" },
              ]}
              value={length}
              onChange={setLength}
            />
          </View>
          {motion ? null : (
            <View style={{ gap: 6 }}>
              <Txt variant="cap">Quality</Txt>
              <ChipRow<"standard" | "premium">
                options={[
                  { value: "standard", label: `Standard · free (${billing.data?.freeVideosPerWeek ?? 3} a week)` },
                  ...(billing.data?.premiumAvailable === false ? [] : [{ value: "premium" as const, label: `Premium AI animation · ${premiumCost} credits` }]),
                ]}
                value={quality}
                onChange={setQuality}
              />
            </View>
          )}
        </>
      )}
    </Screen>
  );
}
