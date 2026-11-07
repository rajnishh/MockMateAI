import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Linking, Pressable, View } from "react-native";

import { Icon } from "@/components/icon";
import { FestivalCard, RecipeLockCard, RecipeRail } from "@/components/recipes";
import { Banner, Button, Card, ChipRow, Credits, Field, Header, ListRow, ProgressBar, Row, Screen, Txt } from "@/components/ui";
import { api, ApiError, UPLOAD_CANCELLED, type Idea, type Quality, type RecipePage, type Voice } from "@/lib/api";
import { buildClaudePrompt, claudeUrl } from "@/lib/claude-prompt";
import { capture, chooseFromGallery, filmNow, saveClip, snapPhoto, usePreparing } from "@/lib/capture";
import { API_URL } from "@/lib/config";
import { ideaBrief } from "@/lib/formats";
import { LANGUAGES } from "@/lib/languages";
import { earnsFor, earnsLine, qualityLabel } from "@/lib/recipes";
import { useSession } from "@/lib/session";
import { INDIAN_ART, LOOKS, type Style } from "@/lib/styles";
import { useData } from "@/lib/use-data";
import { useTheme } from "@/theme";

type Kind = "story" | "motion" | "dance" | "edit";
const KINDS: Kind[] = ["story", "motion", "dance", "edit"];
type Ending = "auto" | "none" | "follow" | "comment";
type Picked = { uri: string; name: string; type: string; seconds: number | null; mb: number | null };

// Same limit as the server: the free plan's 60-second reels.
const MAX_EDIT_SEC = 60;
// Uploads pass through Cloudflare, which refuses anything over 100 MB before the server sees it.
const MAX_EDIT_MB = 95;
// Connect AI lives on the web app; the phone only points there.
const CONNECT_URL = API_URL ? `${API_URL}/connect` : "";

const IDEA_PLACEHOLDER: Record<Exclude<Kind, "edit">, string> = {
  story: "Mia finds colours in the puddles after the rain…",
  motion: "3 chai hacks nobody told you, with a tip for each…",
  dance: "A rain dance for the monsoon, counting to five, or brushing teeth…",
};

export default function Create() {
  const { prefs } = useSession();
  const { colors } = useTheme();
  const billing = useData(() => api.billing());
  // "Use this recipe" opens Create with ?recipe={publicId}; the recipe locks the kind, look and length.
  // Studio's Lab opens Create with ?kind=dance.
  const params = useLocalSearchParams<{ recipe?: string; kind?: string; from?: string; t?: string; idea?: string; quality?: string }>();
  const [used, setUsed] = useState<RecipePage | null>(null);
  const [recipeGone, setRecipeGone] = useState<string | null>(null);
  const recipesHome = useData(() => api.recipesHome("en", Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""));
  const asKind = (k?: string) => (KINDS.includes(k as Kind) ? (k as Kind) : null);
  const [kind, setKind] = useState<Kind>(() => asKind(params.kind) ?? "story");
  // Create stays mounted as a tab, so a later ?kind= switches the kind when it arrives.
  const [kindParam, setKindParam] = useState(params.kind);
  if (params.kind !== kindParam) {
    setKindParam(params.kind);
    const k = asKind(params.kind);
    if (k) setKind(k);
  }
  const [ending, setEnding] = useState<Ending>("auto");
  const [keyword, setKeyword] = useState("");
  const [style, setStyle] = useState<Style>("animated");
  const [story, setStory] = useState("");
  const [language, setLanguage] = useState(prefs?.language ?? "hi");
  const [length, setLength] = useState("30");
  const [quality, setQuality] = useState<Quality>("standard");
  const [photo, setPhoto] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [photoConsent, setPhotoConsent] = useState<"no" | "yes">("no");
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [video, setVideo] = useState<Picked | null>(null);
  const [preparing, setPreparing] = useState(false);
  // From "What should we make?": Edit my video with the clip just filmed (lib/capture.ts).
  const [captureParam, setCaptureParam] = useState<string | undefined>();
  // A clip from "What should we make?": Create becomes its "Add effects" step, with the clip and
  // its options first (capture.md 4) instead of below the camera strip and recipes.
  const [fromCapture, setFromCapture] = useState(false);
  if (params.from === "capture" && params.t !== captureParam) {
    setCaptureParam(params.t);
    const c = capture.take();
    setFromCapture(Boolean(c));
    if (c?.kind === "photo") {
      // A reel starring the photo: AI animation is the cheapest look that uses a photo.
      setKind("story");
      setQuality(params.quality === "cinematic" ? "cinematic" : "premium");
      setPhoto({ uri: c.uri, name: c.name, type: c.type });
      setPhotoConsent("no");
    } else if (c) {
      setKind("edit");
      setVideo(c);
    }
    if (params.idea) setStory(params.idea);
  }
  // A festival chip (lib/festivals.ts) opens Create with ?idea=, which prefills the story.
  const [ideaParam, setIdeaParam] = useState<string | undefined>();
  if (params.from !== "capture" && params.idea && params.t !== ideaParam) {
    setIdeaParam(params.t);
    setKind("story");
    setStory(params.idea);
  }
  const [captions, setCaptions] = useState<"on" | "off">("on");
  const [zooms, setZooms] = useState<"on" | "off">("on");
  const [effects, setEffects] = useState<"on" | "off">("on");
  const [sounds, setSounds] = useState<"on" | "off">("on");
  const [voice, setVoice] = useState<Voice>("natural");
  const [review, setReview] = useState<"on" | "off">("off");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; credits: boolean } | null>(null);
  // Edit my video's upload: bytes sent so far, and Cancel (capture.md 5).
  const [sent, setSent] = useState<{ done: number; total: number } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const spoken = useRef(0);
  const [saved, setSaved] = useState<string | null>(null);
  const galleryBusy = usePreparing();

  useEffect(() => {
    if (!params.recipe) return;
    api.recipe(params.recipe, "en").then(
      (p) => {
        const r = p.recipe;
        setRecipeGone(null);
        setUsed(p);
        setKind(r.format);
        if (r.style) setStyle(r.style as Style);
        setLength(String(r.durationSec));
        // A premium recipe on a server without premium: Standard, with a note.
        const q = r.quality === "premium" && p.price?.premiumAvailable === false ? "standard" : r.quality === "cinematic" && p.price && !p.price.cinematicAvailable ? "standard" : r.quality;
        setQuality(q);
        if (r.has.format === "motion" || r.has.format === "edit") setEnding(r.has.ending as Ending);
      },
      (err: Error) => setRecipeGone(err instanceof ApiError && err.status === 410 ? "This recipe isn't shared any more. You can still make this reel without it." : err.message),
    );
  }, [params.recipe]);

  // Keeps every value and unlocks everything; the maker earns nothing then.
  function withoutRecipe() {
    setUsed(null);
    setRecipeGone(null);
    router.setParams({ recipe: undefined });
  }

  const durationSec = Number(length);
  const perShot = billing.data?.premiumCreditsPerShot ?? 12;
  const premiumCost = Math.round(durationSec / 5) * perShot;
  const cinematicCost = Math.round(durationSec / 5) * (billing.data?.cinematicCreditsPerShot ?? 30);
  const motion = kind === "motion";
  const dance = kind === "dance";
  // Motion and dance reels are drawn by Reelkar: free weekly reels, no AI animation choice.
  const drawn = motion || dance;
  const editing = kind === "edit";
  const focus = fromCapture && (editing ? Boolean(video) : kind === "story" && Boolean(photo));
  // Only story reels in AI animation or Cinematic use a photo.
  const usesPhoto = kind === "story" && quality !== "standard";
  const tooLong = Boolean(video?.seconds && video.seconds > MAX_EDIT_SEC + 0.5);
  const tooBig = Boolean(video?.mb && video.mb > MAX_EDIT_MB);
  const blocked = editing ? !video || tooLong || tooBig : story.trim().length < 20 || (usesPhoto && photo !== null && photoConsent !== "yes");
  const keywordValue = ending === "comment" && keyword.trim() ? keyword.trim().toUpperCase() : undefined;
  const recipe = used?.recipe;
  // What this reel costs and what the recipe's maker earns from it (the server does the same sum).
  const freeLeft = used?.price?.freeLeft ?? null;
  const chargeNow = quality === "cinematic" && !drawn ? cinematicCost : quality === "premium" && !drawn ? premiumCost : freeLeft === 0 ? 1 : 0;
  const recipeEarns = used ? (used.mine ? { hundredths: 0, kind: "own" as const } : used.paidRatioBp !== undefined ? earnsFor(chargeNow, used.paidRatioBp, recipe!.rateBp) : undefined) : undefined;

  async function getIdeas() {
    setIdeasBusy(true);
    try {
      // Ideas fit the reel type picked; "More ideas" skips the ones already shown.
      setIdeas(await api.ideas(prefs?.topic ?? "", language, { format: editing ? undefined : kind as Exclude<Kind, "edit">, avoid: ideas?.map((i) => i.title) }));
    } catch (err) {
      setError({ text: (err as Error).message, credits: false });
    } finally {
      setIdeasBusy(false);
    }
  }

  async function pickVideo() {
    setError(null);
    setPreparing(true);
    // iPhones film in 4K, often over 100 MB a minute. The reel is 1080p, so iOS hands over a 1080p
    // HEVC copy instead of the original; Android sends the file as it is.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsEditing: false,
      videoMaxDuration: MAX_EDIT_SEC,
      videoExportPreset: ImagePicker.VideoExportPreset.HEVC_1920x1080,
    }).finally(() => setPreparing(false));
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

  async function pickPhoto() {
    setError(null);
    // iPhone photos are HEIC, which the server doesn't take; "compatible" hands over a JPEG copy.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.9,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled || !result.assets.length) return;
    const a = result.assets[0];
    const type = a.mimeType ?? "image/jpeg";
    setPhoto({ uri: a.uri, name: a.fileName ?? `photo-${Date.now()}.${type === "image/png" ? "png" : "jpg"}`, type });
    setPhotoConsent("no");
  }

  function onSent(done: number, total: number) {
    setSent({ done, total });
    // VoiceOver hears 25, 50, 75 and 100%.
    const quarter = Math.floor((done / total) * 4);
    if (quarter > spoken.current) {
      spoken.current = quarter;
      AccessibilityInfo.announceForAccessibility(`Uploaded ${quarter * 25}%`);
    }
  }

  async function keepClip() {
    if (!video) return;
    const r = await saveClip(video.uri).catch(() => "denied" as const);
    setSaved(r === "saved" ? "Saved to Photos." : r === "blocked" ? "Turn on Photos for Reelkar in Settings to save it." : "Couldn't save it to Photos.");
  }

  async function make() {
    setBusy(true);
    setError(null);
    setSaved(null);
    spoken.current = 0;
    abort.current = new AbortController();
    try {
      const fromRecipe = recipe ? { recipe: recipe.publicId } : {};
      const { id } = editing
        ? await api.uploadEdit({
            ...fromRecipe,
            video: { uri: video!.uri, name: video!.name, type: video!.type },
            language,
            captions: captions === "on",
            zooms: zooms === "on",
            effects: effects === "on",
            sounds: sounds === "on",
            voice,
            review: review === "on",
            ending,
            keyword: keywordValue,
            brand: prefs?.brand,
          }, { onProgress: onSent, signal: abort.current.signal })
        : recipe
          ? // The recipe sets the kind, look, length, ending and script shape; the rest is the user's.
            await api.createFilm({
              recipe: recipe.publicId,
              story: story.trim(),
              ...(usesPhoto && photo ? { photo: await api.uploadPhoto(photo), photoConsent: photoConsent === "yes" } : {}),
              language,
              quality: drawn ? "standard" : quality,
              ...(motion ? { keyword: keywordValue, brand: prefs?.brand } : {}),
              ...(dance ? { brand: prefs?.brand } : {}),
            })
          : await api.createFilm({
              story: story.trim(),
              ...(usesPhoto && photo ? { photo: await api.uploadPhoto(photo), photoConsent: photoConsent === "yes" } : {}),
              language,
              durationSec,
              quality: drawn ? "standard" : quality,
              style: dance ? "animated" : style,
              format: kind === "motion" || kind === "dance" ? kind : "story",
              ...(motion ? { ending, keyword: keywordValue, brand: prefs?.brand } : {}),
              ...(dance ? { kidSafe: true, brand: prefs?.brand } : {}),
            });
      setStory("");
      setVideo(null);
      setFromCapture(false);
      setPhoto(null);
      router.push(`/making/${id}`);
    } catch (err) {
      // The maker stopped sharing meanwhile: nothing was charged, the topic is kept.
      if (err instanceof ApiError && err.status === 410) setRecipeGone(err.message);
      // Cancel keeps the video and says nothing; Edit my video sends it again.
      else if (!(err instanceof ApiError && err.message === UPLOAD_CANCELLED)) setError({ text: (err as Error).message, credits: err instanceof ApiError && err.needCredits });
    } finally {
      setBusy(false);
      setSent(null);
      abort.current = null;
    }
  }

  // Opens Claude (the app if installed, else the browser) with a prompt that makes this reel.
  function buildWithClaude() {
    if (editing) return;
    const lang = LANGUAGES.find((l) => l.code === language);
    const prompt = buildClaudePrompt({
      type: kind === "story" ? "film" : kind,
      idea: story,
      durationSec,
      language: lang && { code: lang.code, name: lang.label },
      brand: prefs?.brand,
      style: kind === "story" ? style : undefined,
      kidSafe: dance,
    });
    Linking.openURL(claudeUrl(prompt)).catch(() => setError({ text: "Couldn't open Claude. Try again.", credits: false }));
  }

  const brandButton = (
    <Button
      label={prefs?.brand?.accent || prefs?.brand?.handle ? "Using your brand look · change" : "Add your brand colour and handle"}
      kind="ghost"
      icon="edit"
      onPress={() => router.push("/account")}
      style={{ paddingHorizontal: 0 }}
    />
  );

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
      {brandButton}
    </View>
  );

  // A recipe's "comment" ending asks for the user's own word; the rest of the ending is the recipe's.
  const recipeKeyword =
    ending === "comment" ? <Field label="Word to comment (optional)" value={keyword} onChangeText={(t) => setKeyword(t.replace(/\s/g, "").slice(0, 20))} placeholder="GUIDE" autoCapitalize="characters" /> : null;

  return (
    <Screen
      footer={
        editing && busy ? (
          <View style={{ gap: 8 }}>
            <ProgressBar value={sent ? sent.done / sent.total : 0} />
            <Txt variant="label" style={{ textAlign: "center" }}>
              {sent ? `Uploading ${Math.round(sent.done / 1048576)} of ${Math.max(1, Math.round(sent.total / 1048576))} MB` : "Starting the upload…"}
            </Txt>
            <Txt variant="cap" style={{ textAlign: "center" }}>
              Stay on this screen until it&apos;s uploaded.
            </Txt>
            <Button label="Cancel" kind="ghost" block onPress={() => abort.current?.abort()} />
          </View>
        ) : (
        <>
          <Button
            label={editing ? (busy ? "Uploading…" : "Edit my video") : dance ? "Make the dance" : quality !== "standard" && !drawn ? `Make my reel · ${quality === "cinematic" ? cinematicCost : premiumCost} credits` : "Make my reel"}
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
                  : tooBig
                  ? "Trim the video, or film it at 1080p, then pick it again"
                  : "About as long as your video to edit · you can leave this screen"
                : "Choose a video you filmed"
              : blocked
                ? "Write at least 20 characters, or pick an idea"
                : "About 2 minutes · you can leave this screen"}
          </Txt>
          {recipe ? <Txt variant="cap" style={{ textAlign: "center" }}>{earnsLine(recipe.handle, recipeEarns)}</Txt> : null}
        </>
        )
      }>
      {focus ? (
        <>
          {editing ? (
            <Header title="Add effects" sub={video?.seconds ? `${Math.round(video.seconds)} s video` : "Your video"} right={<Credits count={billing.data?.balance ?? null} />} />
          ) : (
            <Header title="Star in a story reel" sub="Your photo" right={<Credits count={billing.data?.balance ?? null} />} />
          )}
          <Button label="Make something else" kind="ghost" small icon="back" disabled={busy} onPress={() => (setFromCapture(false), setVideo(null), setPhoto(null), setError(null))} style={{ alignSelf: "flex-start", paddingHorizontal: 0 }} />
        </>
      ) : (
        <Header title="Make a reel" right={<Credits count={billing.data?.balance ?? null} />} />
      )}
      {focus ? null : (
      <>
      <Card>
        <Txt variant="md">Start with your camera</Txt>
        <Row style={{ gap: 8, flexWrap: "nowrap" }}>
          <CaptureTile icon="video" label="Film" a11y="Film a video" disc={colors.brand} ink={colors.onBrand} onPress={filmNow} />
          <CaptureTile icon="camera" label="Snap" a11y="Take a photo" disc={colors.teal} ink={colors.onTeal} onPress={snapPhoto} />
          <CaptureTile icon="image" label={galleryBusy ? "Preparing…" : "Gallery"} a11y="Choose from gallery" disc={colors.surfaceSunken} ink={colors.ink} busy={galleryBusy} onPress={chooseFromGallery} />
        </Row>
      </Card>
      <Card onPress={() => router.push("/hum")} style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.deep, borderColor: colors.deep }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand }}>
          <Icon name="mic" size={26} color={colors.onBrand} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="md" style={{ color: colors.onDeep }}>
            Hum it
          </Txt>
          <Txt variant="cap" style={{ color: colors.onDeep, opacity: 0.85 }}>
            Hum, sing or just say it. Reelkar makes the song, reel or music video.
          </Txt>
        </View>
        <Icon name="right" size={20} color={colors.onDeep} />
      </Card>
      {recipeGone ? <Banner kind="warn" text={recipeGone} action={<Button label="Make it without the recipe" small kind="secondary" onPress={withoutRecipe} />} /> : null}
      {recipe ? (
        <RecipeLockCard card={recipe} has={recipe.has} onWithout={withoutRecipe} />
      ) : params.recipe ? null : (
        <>
          {recipesHome.data?.festival ? <FestivalCard festival={recipesHome.data.festival} thumbs={recipesHome.data.festival.thumbs} /> : null}
          <RecipeRail title="Start from a recipe" cards={recipesHome.data?.start ?? []} onSeeAll={() => router.push("/recipes")} />
        </>
      )}
      </>
      )}
      {error ? (
        <Banner
          kind="error"
          title={error.credits ? "Not enough credits" : undefined}
          text={error.text}
          action={
            error.credits ? (
              <Button label="Get credits" small onPress={() => router.push("/credits")} />
            ) : editing && video ? (
              <View style={{ gap: 6 }}>
                <Button label="Try again" small onPress={make} />
                <Button label="Save clip to Photos" small kind="ghost" onPress={keepClip} />
              </View>
            ) : undefined
          }
        />
      ) : null}
      {saved ? <Txt variant="cap">{saved}</Txt> : null}
      {recipe || focus ? null : (
      <View style={{ gap: 6 }}>
        <Txt variant="cap">What do you want to make?</Txt>
        <ChipRow<Kind>
          options={[
            { value: "story", label: "Story with pictures" },
            { value: "motion", label: "Motion reel · text and graphics" },
            { value: "dance", label: "Kids dance · cartoon kids, dhol beat, chant" },
            { value: "edit", label: "Edit my video" },
          ]}
          value={kind}
          onChange={setKind}
        />
        {motion ? <Txt variant="cap">Tips, lists, numbers and quotes animated on screen with a voice-over. Uses your free weekly reels.</Txt> : null}
        {dance ? <Txt variant="cap">Cartoon kids dance to a dhol beat while a voice chants a catchy rhyme, with bouncing captions. Made for young children. Uses your free weekly reels.</Txt> : null}
        {editing ? <Txt variant="cap">Upload a video you filmed. We add captions in your language, zooms, cards for your main points, effects around you and sounds.</Txt> : null}
      </View>
      )}
      {focus ? null : (
      <Card flat onPress={() => router.push("/songs")}>
        <Row style={{ flexWrap: "nowrap" }}>
          <Icon name="music" color={colors.tealText} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="label">Make a song</Txt>
            <Txt variant="cap">Song Studio · lyrics, style and voice, sung in 2 versions</Txt>
          </View>
          <Icon name="right" size={18} color={colors.inkMuted} />
        </Row>
      </Card>
      )}

      {editing ? (
        <>
          <Card>
            {video ? (
              <>
                <Txt variant="label" numberOfLines={1}>
                  {video.name}
                </Txt>
                <Txt variant="cap" color={tooLong || tooBig ? "danger" : "inkMuted"}>
                  {[video.seconds ? `${Math.round(video.seconds)} s` : null, video.mb ? `${video.mb.toFixed(1)} MB` : null].filter(Boolean).join(" · ") || "Ready to upload"}
                  {tooLong ? ` · trim it to ${MAX_EDIT_SEC} s first` : tooBig ? ` · too large, up to ${MAX_EDIT_MB} MB` : ""}
                </Txt>
                <Button label="Choose another video" small kind="secondary" loading={preparing} onPress={pickVideo} />
              </>
            ) : (
              <>
                <Txt variant="md">Choose a video</Txt>
                <Txt variant="cap">Vertical videos of you talking work best. Up to {MAX_EDIT_SEC} seconds.</Txt>
                <Button label={preparing ? "Preparing video…" : "Choose from gallery"} icon="film" loading={preparing} onPress={pickVideo} />
              </>
            )}
          </Card>
          <View style={{ gap: 6 }}>
            <Txt variant="cap">Language you speak in the video</Txt>
            <ChipRow options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} value={language} onChange={setLanguage} />
          </View>
          {recipe ? recipeKeyword : (
          <>
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
            <View style={{ gap: 6 }}>
              <Txt variant="cap">Sounds</Txt>
              <ChipRow<"on" | "off">
                options={[
                  { value: "on", label: "On" },
                  { value: "off", label: "Off" },
                ]}
                value={sounds}
                onChange={setSounds}
              />
            </View>
          </Row>
          <View style={{ gap: 6 }}>
            <Txt variant="cap">Effects around you</Txt>
            <ChipRow<"on" | "off">
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
              value={effects}
              onChange={setEffects}
            />
            <Txt variant="cap">A big word behind you, spotlight, sticker cut-out and stamps on your best moments.</Txt>
          </View>
          <View style={{ gap: 6 }}>
            <Txt variant="cap">Your voice</Txt>
            <ChipRow<Voice>
              options={[
                { value: "natural", label: "As recorded" },
                { value: "clear", label: "Clear" },
                { value: "deeper", label: "Deeper" },
              ]}
              value={voice}
              onChange={setVoice}
            />
            <Txt variant="cap">
              {voice === "clear" ? "Less background noise and an even volume." : voice === "deeper" ? "Still your voice, a little deeper and fuller. Lips stay in sync." : "Your voice as you recorded it."}
            </Txt>
          </View>
          {endingPicker}
          </>
          )}
          <View style={{ gap: 6 }}>
            <Txt variant="cap">Check effects before rendering</Txt>
            <ChipRow<"on" | "off">
              options={[
                { value: "off", label: "No, render it" },
                { value: "on", label: "Yes, let me check" },
              ]}
              value={review}
              onChange={setReview}
            />
            <Txt variant="cap">Either way, you can fine-tune each effect after it&apos;s made.</Txt>
          </View>
        </>
      ) : (
        <>
          {motion ? (recipe ? recipeKeyword : endingPicker) : null}
          {dance ? brandButton : null}
          {drawn || recipe ? null : (
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
          <Field
            label={recipe ? "What's your reel about?" : dance ? "What is the dance about?" : motion ? "What is the reel about?" : "Your idea or story"}
            value={story}
            onChangeText={setStory}
            multiline
            maxLength={2000}
            placeholder={recipe?.topicHint || IDEA_PLACEHOLDER[kind as Exclude<Kind, "edit">]}
          />
          <Txt variant="cap">Start with a line that stops the scroll, then say what happens and how it ends.</Txt>
          <Button label={ideasBusy ? "Finding ideas…" : ideas ? "More ideas" : "Give me ideas for my topic"} kind="ghost" icon="sparkle" disabled={ideasBusy} onPress={getIdeas} style={{ paddingHorizontal: 0 }} />
          {ideas ? (
            <Card flat>
              {ideas.map((i) => (
                <ListRow key={i.title} title={i.title} sub={i.hook ? `“${i.hook}”\n${i.idea}` : i.idea} right={<Button label="Use" small kind="secondary" onPress={() => (setStory(ideaBrief(i)), setIdeas(null))} />} />
              ))}
            </Card>
          ) : null}
          {/* Out of the pinned footer, so on an iPhone SE the footer is just the Make button and its hint. */}
          <Card flat>
            <ListRow icon="sparkle" title="Build it with Claude" sub="Claude writes and makes this reel with you, using the Reelkar connector" onPress={buildWithClaude} />
            <Pressable accessibilityRole="link" disabled={!CONNECT_URL} onPress={() => Linking.openURL(CONNECT_URL).catch(() => undefined)} style={{ minHeight: 44, justifyContent: "center" }}>
              <Txt variant="cap" color={CONNECT_URL ? "tealText" : "inkMuted"}>
                {`Set it up once in Connect AI ${CONNECT_URL ? `at ${CONNECT_URL.replace(/^https?:\/\//, "")}` : "on the Reelkar website"}`}
              </Txt>
            </Pressable>
          </Card>
          <View style={{ gap: 6 }}>
            <Txt variant="cap">Voice and captions</Txt>
            <ChipRow options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} value={language} onChange={setLanguage} />
            {recipe ? <Txt variant="cap">The recipe works in any language</Txt> : null}
          </View>
          {recipe ? null : (
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
          )}
          {drawn ? null : (
            <View style={{ gap: 6 }}>
              <Txt variant="cap">Quality</Txt>
              <ChipRow<Quality>
                options={[
                  { value: "standard" as const, label: `Standard · free (${billing.data?.freeVideosPerWeek ?? 3} a week)` },
                  ...(billing.data?.premiumAvailable === false ? [] : [{ value: "premium" as const, label: `Premium AI animation · ${premiumCost} credits` }]),
                  ...(billing.data?.cinematicAvailable ? [{ value: "cinematic" as const, label: `Cinematic hyper-real 1080p · ${cinematicCost} credits` }] : []),
                ]
                  // The recipe's own quality first, marked.
                  .sort((a, b) => (recipe ? Number(b.value === recipe.quality) - Number(a.value === recipe.quality) : 0))
                  .map((o) => (recipe && o.value === recipe.quality ? { ...o, label: `${o.label} · Recipe uses this` } : o))}
                value={quality}
                onChange={setQuality}
              />
              {recipe && recipe.quality !== "standard" && quality === "standard" ? (
                <Txt variant="cap">{`The recipe was made in ${qualityLabel(recipe.quality)}. Standard looks simpler.`}</Txt>
              ) : null}
            </View>
          )}
          {usesPhoto ? (
            <View style={{ gap: 6 }}>
              <Txt variant="cap">Star in it (optional)</Txt>
              <Txt variant="cap">Add a clear photo of one face. The reel&apos;s lead will look like this person.</Txt>
              <Row style={{ gap: 8 }}>
                <Button label={photo ? "Change photo" : "Add a photo"} kind="secondary" small icon="user" onPress={pickPhoto} />
                {photo ? <Button label="Remove" kind="ghost" small onPress={() => setPhoto(null)} /> : null}
              </Row>
              {photo ? (
                <>
                  <Txt variant="cap">Is this you, or did this person agree to be in your video? Famous people aren&apos;t allowed.</Txt>
                  <ChipRow<"no" | "yes">
                    options={[
                      { value: "no", label: "Not yet" },
                      { value: "yes", label: "Yes, they agreed" },
                    ]}
                    value={photoConsent}
                    onChange={setPhotoConsent}
                  />
                </>
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

// Film, Snap or Gallery at the top of Create (design/v3.0/capture.md 1): one word under an icon disc.
function CaptureTile({ icon, label, a11y, disc, ink, busy, onPress }: { icon: "video" | "camera" | "image"; label: string; a11y: string; disc: string; ink: string; busy?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 96,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.surfaceRaised,
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingVertical: 12,
        opacity: pressed ? 0.85 : 1,
      })}>
      <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: disc }}>
        {busy ? <ActivityIndicator color={ink} /> : <Icon name={icon} size={24} color={ink} />}
      </View>
      <Txt variant="label">{label}</Txt>
    </Pressable>
  );
}
