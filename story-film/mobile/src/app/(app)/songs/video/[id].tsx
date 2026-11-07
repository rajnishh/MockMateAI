import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, TextInput, View } from "react-native";

import { ReelVideo } from "@/components/reel-video";
import { Banner, Button, Card, ChipRow, Header, ProgressBar, Row, Screen, Skeleton, Txt } from "@/components/ui";
import { api, ApiError, type Film } from "@/lib/api";
import { capture } from "@/lib/capture";
import { musicVideos, type MusicVideo, type MusicVideoKind, type MusicVideoOptions, type ShotType, type StoryboardShot } from "@/lib/music-video";
import { formatTime } from "@/lib/songs";
import { useData } from "@/lib/use-data";
import { fonts, radius, useTheme } from "@/theme";

const KINDS: { kind: MusicVideoKind; title: string; line: string; icon: string }[] = [
  { kind: "full", title: "Full music video", line: "Sings, dances and acts out the song, cut on the beat", icon: "✨" },
  { kind: "performance", title: "Performance", line: "Your star sings to camera, lips in sync", icon: "🎤" },
  { kind: "story", title: "Story video", line: "AI scenes act out the lyrics, same star throughout", icon: "🎞" },
  { kind: "lyric", title: "Lyric video", line: "Moving art and big words on the beat", icon: "Aa" },
];

const SHOT_LABEL: Record<ShotType, string> = { sing: "🎤 Sing", dance: "💃 Dance", scene: "🎞 Scene", lyric: "Aa Lyric" };

const STAGES: Record<string, { text: string; at: number }> = {
  timing: { text: "Syncing lyrics to the singing", at: 0.1 },
  beats: { text: "Finding the beat", at: 0.2 },
  scenes: { text: "Planning the shots", at: 0.35 },
  keyframes: { text: "Drawing the shots", at: 0.55 },
  stems: { text: "Taking out the vocals", at: 0.15 },
  clips: { text: "Filming: singing, dancing and scenes", at: 0.5 },
  assemble: { text: "Cutting it to the beat", at: 0.9 },
};

type Look = "photoreal" | "cinematic" | "animated";
type Picked = { uri: string; name: string; type: string };

export default function MusicVideoScreen() {
  // film: a storyboard to pick up again, from My videos.
  const { id, film, from, t } = useLocalSearchParams<{ id: string; film?: string; from?: string; t?: string }>();
  const song = useData(() => api.song(id));
  const [kind, setKind] = useState<MusicVideoKind>("full");
  const [lengthSec, setLengthSec] = useState<"15" | "30" | "all">("30");
  const [startSec, setStartSec] = useState(0);
  const [look, setLook] = useState<Look>("photoreal");
  const [danceStyle, setDanceStyle] = useState("bollywood");
  const [danceClip, setDanceClip] = useState<Picked | null>(null);
  const [danceConsent, setDanceConsent] = useState<"no" | "yes">("no");
  // "Copy my moves" from "What should we make?": the clip just filmed becomes the dance to copy.
  const [captureParam, setCaptureParam] = useState<string | undefined>();
  if (from === "capture" && t !== captureParam) {
    setCaptureParam(t);
    const c = capture.take();
    if (c?.kind === "video") {
      setKind("full");
      setDanceClip({ uri: c.uri, name: c.name, type: c.type });
      setDanceConsent("no");
    }
  }
  const [photo, setPhoto] = useState<Picked | null>(null);
  const [photoConsent, setPhotoConsent] = useState<"no" | "yes">("no");
  const [captions, setCaptions] = useState<"on" | "off">("on");
  const [kids, setKids] = useState<"no" | "yes">("no");
  const [videoId, setVideoId] = useState<string | null>(film ?? null);
  const [video, setVideo] = useState<MusicVideo | null>(null);
  const [shots, setShots] = useState<StoryboardShot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; needCredits?: boolean } | null>(null);
  const [pollKey, setPollKey] = useState(0);
  // Opening another storyboard from My videos reuses this screen with a new film param.
  const [shownFilm, setShownFilm] = useState(film);
  if (film && film !== shownFilm) {
    setShownFilm(film);
    setVideoId(film);
    setVideo(null);
  }

  const total = song.data?.durationSec ?? 0;
  const length = lengthSec === "all" || Number(lengthSec) >= total ? total : Number(lengthSec);
  const start = Math.min(startSec, Math.max(0, total - length));
  const [options, setOptions] = useState<MusicVideoOptions | null>(null);
  useEffect(() => {
    if (total) musicVideos.options(id, length).then(setOptions, (err: Error) => setError({ text: err.message }));
  }, [id, total, length]);
  const chosen = options?.kinds.find((k) => k.kind === kind);
  const starred = kind !== "lyric";

  const poll = useCallback(async (vid: string) => {
    const next = await musicVideos.get(id, vid);
    setVideo(next);
    if (next.storyboard) setShots(next.storyboard.shots);
    return next;
  }, [id]);

  useEffect(() => {
    if (!videoId) return;
    let stop = false;
    const tick = async () => {
      const next = await poll(videoId).catch(() => null);
      if (!stop && !(next && ["review", "completed", "failed"].includes(next.status))) timer = setTimeout(tick, 3000);
    };
    let timer = setTimeout(tick, 1000);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [videoId, pollKey, poll]);

  async function pickPhoto() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9, preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible });
    if (r.canceled || !r.assets.length) return;
    const a = r.assets[0];
    const type = a.mimeType ?? "image/jpeg";
    setPhoto({ uri: a.uri, name: a.fileName ?? `photo-${Date.now()}.${type === "image/png" ? "png" : "jpg"}`, type });
    setPhotoConsent("no");
  }

  async function pickDance() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], videoMaxDuration: 15 });
    if (r.canceled || !r.assets.length) return;
    const a = r.assets[0];
    setDanceClip({ uri: a.uri, name: a.fileName ?? `dance-${Date.now()}.mp4`, type: a.mimeType ?? "video/mp4" });
    setDanceConsent("no");
  }

  const fail = (err: unknown) => setError({ text: (err as Error).message, needCredits: err instanceof ApiError && err.needCredits });

  async function preview() {
    setBusy(true);
    setError(null);
    try {
      const photoId = starred && photo ? await api.uploadPhoto(photo) : undefined;
      const clipId = kind === "full" && danceClip ? await musicVideos.uploadDanceClip(id, danceClip) : undefined;
      const res = await musicVideos.start(id, {
        kind,
        style: look,
        danceStyle,
        range: { start, end: start + length },
        captions: captions === "on",
        kidSafe: kids === "yes",
        ...(photoId ? { photo: photoId, photoConsent: true } : {}),
        ...(clipId ? { danceClip: clipId, danceClipConsent: true } : {}),
      });
      setVideo({ id: res.id, status: "queued", stage: null, error: null, videoUrl: null, storyboard: null });
      setVideoId(res.id);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function save(redraw: number[] = []) {
    if (!videoId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await musicVideos.change(id, videoId, shots.map((s, i) => ({ type: s.type, imagePrompt: s.imagePrompt, redraw: redraw.includes(i) })));
      setVideo((v) => (v ? { ...v, storyboard: res.storyboard } : v));
      setShots(res.storyboard.shots);
      if (res.blocked) setError({ text: "A picture was blocked by the safety filter. Change its words and try again." });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function make() {
    if (!videoId) return;
    setBusy(true);
    setError(null);
    try {
      await musicVideos.render(id, videoId);
      setVideo((v) => (v ? { ...v, status: "queued", stage: null } : v));
      setPollKey((k) => k + 1);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  const board = video?.storyboard;
  const changed = board ? shots.some((s, i) => s.type !== board.shots[i]?.type || s.imagePrompt !== board.shots[i]?.imagePrompt) : false;
  const working = video && (video.status === "queued" || video.status === "running");
  const needsConsent = (starred && photo && photoConsent !== "yes") || (kind === "full" && danceClip && danceConsent !== "yes");

  const footer = !videoId ? (
    <View style={{ gap: 6 }}>
      <Button label="Preview storyboard · free" icon="sparkle" block loading={busy} disabled={!chosen?.available || Boolean(needsConsent)} onPress={preview} />
      <Txt variant="cap" style={{ textAlign: "center" }}>
        {chosen ? `Check every shot first. You pay ${chosen.credits} credits only when you make it.` : " "}
      </Txt>
    </View>
  ) : video?.status === "review" && board ? (
    changed ? (
      <Button label="Save changes and redraw" icon="refresh" block loading={busy} onPress={() => save()} />
    ) : (
      <View style={{ gap: 6 }}>
        <Button label={`Make music video · ${board.credits} credits`} icon="film" block loading={busy} onPress={make} />
        <Txt variant="cap" style={{ textAlign: "center" }}>
          Refunded if it fails. Takes a few minutes.
        </Txt>
      </View>
    )
  ) : video?.status === "completed" ? (
    <Button label="Open in My videos" icon="right" block onPress={() => router.push(`/reel/${videoId}`)} />
  ) : undefined;

  return (
    <Screen footer={footer}>
      <Header title="Music video" sub={song.data ? `${song.data.title} · ${formatTime(total)}` : undefined} back={`/songs/${id}`} />
      {song.error ? <Banner kind="error" text={song.error} /> : null}
      {error ? (
        <Banner kind="error" text={error.text} action={error.needCredits ? <Button label="Get credits" small kind="secondary" onPress={() => router.push("/credits")} /> : undefined} />
      ) : null}

      {!song.data ? (
        <Skeleton height={240} />
      ) : !videoId ? (
        <>
          <View style={{ gap: 10 }} accessibilityRole="radiogroup">
            {KINDS.map((k) => {
              const o = options?.kinds.find((x) => x.kind === k.kind);
              return <KindCard key={k.kind} {...k} credits={o?.credits} available={o?.available ?? true} selected={kind === k.kind} onPress={() => setKind(k.kind)} />;
            })}
          </View>

          <Card>
            <Txt variant="label">Length</Txt>
            <ChipRow<"15" | "30" | "all">
              options={[...(total > 15 ? [{ value: "15" as const, label: "15 s" }] : []), ...(total > 30 ? [{ value: "30" as const, label: "30 s" }] : []), { value: "all", label: "Whole song" }]}
              value={lengthSec}
              onChange={setLengthSec}
            />
            {length < total ? (
              <Row style={{ alignItems: "center", gap: 8 }}>
                <Txt variant="cap" style={{ flex: 1 }}>
                  From {formatTime(start)} to {formatTime(start + length)}
                </Txt>
                <Button label="−5 s" small kind="secondary" disabled={start <= 0} onPress={() => setStartSec(Math.max(0, start - 5))} />
                <Button label="+5 s" small kind="secondary" disabled={start >= total - length} onPress={() => setStartSec(Math.min(total - length, start + 5))} />
              </Row>
            ) : null}
          </Card>

          {kind === "full" && options ? (
            <Card>
              <Txt variant="label">Dance style</Txt>
              <ChipRow options={options.danceStyles.map((d) => ({ value: d.id, label: d.label }))} value={danceClip ? "" : danceStyle} onChange={(v) => { setDanceStyle(v); setDanceClip(null); }} />
              <Txt variant="cap">Or copy your own moves: a 5–10 s video of you dancing, whole body in view.</Txt>
              <Row style={{ gap: 8 }}>
                <Button label={danceClip ? "Change my dance" : "Use my dance"} kind="secondary" small icon="film" onPress={pickDance} />
                {danceClip ? <Button label="Remove" kind="ghost" small onPress={() => setDanceClip(null)} /> : null}
              </Row>
              {danceClip ? (
                <>
                  <Txt variant="cap">Is this you dancing, or did the dancer agree to have their moves copied?</Txt>
                  <ChipRow<"no" | "yes"> options={[{ value: "no", label: "Not yet" }, { value: "yes", label: "Yes, it's me or they agreed" }]} value={danceConsent} onChange={setDanceConsent} />
                </>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <Txt variant="label">Look</Txt>
            <ChipRow<Look> options={[{ value: "photoreal", label: "Photoreal" }, { value: "cinematic", label: "Cinematic" }, { value: "animated", label: "3D cartoon" }]} value={look} onChange={setLook} />
            {starred ? (
              <>
                <Txt variant="label">Star in it yourself (optional)</Txt>
                <Txt variant="cap">Add a clear photo of one face. Otherwise AI creates a star.</Txt>
                <Row style={{ gap: 8 }}>
                  <Button label={photo ? "Change photo" : "Add a photo"} kind="secondary" small icon="user" onPress={pickPhoto} />
                  {photo ? <Button label="Remove" kind="ghost" small onPress={() => setPhoto(null)} /> : null}
                </Row>
                {photo ? (
                  <>
                    <Txt variant="cap">Is this you, or did this person agree to be in your video? Famous people aren&apos;t allowed.</Txt>
                    <ChipRow<"no" | "yes"> options={[{ value: "no", label: "Not yet" }, { value: "yes", label: "Yes, they agreed" }]} value={photoConsent} onChange={setPhotoConsent} />
                  </>
                ) : null}
              </>
            ) : null}
            <Txt variant="label">Lyrics on screen</Txt>
            <ChipRow<"on" | "off"> options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]} value={captions} onChange={setCaptions} />
            <Txt variant="label">For kids</Txt>
            <ChipRow<"no" | "yes"> options={[{ value: "no", label: "No" }, { value: "yes", label: "Yes, gentle and bright" }]} value={kids} onChange={setKids} />
          </Card>
        </>
      ) : working || !video ? (
        <Card>
          <Txt variant="md">{STAGES[video?.stage ?? ""]?.text ?? (board ? "Waiting to start filming" : "Waiting to start")}…</Txt>
          <ProgressBar value={STAGES[video?.stage ?? ""]?.at ?? 0.03} />
          <Txt variant="cap">{board ? "Filming takes a few minutes. You can leave; it's saved to My videos." : "Planning your storyboard: about a minute."}</Txt>
        </Card>
      ) : video.status === "failed" ? (
        <Banner kind="error" title="Something went wrong" text={`${video.error ?? "The video failed."}${board ? " Credits were refunded." : ""}`} />
      ) : video.status === "completed" ? (
        // ReelVideo fills its parent, so it gets a 9:16 frame here.
        <View style={styles.video}>
          <ReelVideo film={{ id: video.id, videoUrl: video.videoUrl } as Film} autoPlay />
        </View>
      ) : board ? (
        <>
          <Card>
            <Row style={{ alignItems: "center", gap: 12 }}>
              {board.star?.imageUrl ? <AuthImage path={board.star.imageUrl} style={styles.star} /> : null}
              <View style={{ flex: 1 }}>
                <Txt variant="md">{KINDS.find((k) => k.kind === board.kind)?.title} storyboard</Txt>
                <Txt variant="cap">
                  {board.shots.length} shots · {formatTime(board.duration)} · {board.bpm} BPM, cut on the beat
                </Txt>
              </View>
            </Row>
            <Txt variant="cap">Change what a shot shows, or redraw it. {board.redrawsLeft} free redraws left.</Txt>
          </Card>
          {shots.map((s, i) => (
            <ShotCard
              key={i}
              index={i}
              shot={s}
              frame={board.shots[i]?.frameUrl ?? null}
              types={board.shotTypes}
              busy={busy}
              canRedraw={board.redrawsLeft > 0}
              onChange={(next) => setShots(shots.map((x, j) => (j === i ? next : x)))}
              onRedraw={() => save([i])}
            />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

function KindCard({ title, line, icon, credits, available, selected, onPress }: { title: string; line: string; icon: string; credits?: number; available: boolean; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !available }}
      accessibilityLabel={`${title}. ${line}. ${available ? `${credits ?? ""} credits` : "Coming soon"}`}
      disabled={!available}
      onPress={onPress}
      style={[styles.kind, { backgroundColor: selected ? colors.coralTint : colors.surfaceRaised, borderColor: selected ? colors.action : colors.line, opacity: available ? 1 : 0.5 }]}>
      <Txt variant="lg" style={styles.kindIcon}>
        {icon}
      </Txt>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="md">{title}</Txt>
        <Txt variant="cap">{line}</Txt>
      </View>
      <View style={[styles.price, { backgroundColor: colors.pop }]}>
        <Txt variant="label" color="onPop" style={{ fontSize: 13 }}>
          {available ? (credits === undefined ? "…" : `${credits} cr`) : "Soon"}
        </Txt>
      </View>
    </Pressable>
  );
}

function ShotCard({
  index,
  shot,
  frame,
  types,
  busy,
  canRedraw,
  onChange,
  onRedraw,
}: {
  index: number;
  shot: StoryboardShot;
  frame: string | null;
  types: ShotType[];
  busy: boolean;
  canRedraw: boolean;
  onChange: (s: StoryboardShot) => void;
  onRedraw: () => void;
}) {
  const { colors } = useTheme();
  const tag = shot.type === "sing" ? colors.pop : shot.type === "dance" ? colors.teal : colors.deep;
  const tagText = shot.type === "sing" ? colors.onPop : shot.type === "dance" ? colors.onTeal : colors.onDeep;
  return (
    <Card>
      <Row style={{ gap: 12, alignItems: "flex-start" }}>
        <View style={[styles.frame, { backgroundColor: colors.surfaceSunken }]}>
          {frame ? <AuthImage path={frame} style={StyleSheet.absoluteFill} /> : <Txt variant="cap" style={{ textAlign: "center", padding: 6 }}>Drawn when you make it</Txt>}
          <View style={[styles.tag, { backgroundColor: tag }]}>
            <Txt variant="cap" style={{ color: tagText, fontFamily: fonts.bold }}>
              {SHOT_LABEL[shot.type]}
            </Txt>
          </View>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Txt variant="over">
            Shot {index + 1} · {formatTime(shot.start)}–{formatTime(shot.end)}
          </Txt>
          {shot.lines.length ? <Txt variant="cap" style={{ fontStyle: "italic" }}>“{shot.lines.join(" / ")}”</Txt> : <Txt variant="cap">Instrumental</Txt>}
          <TextInput
            accessibilityLabel={`What shot ${index + 1} shows`}
            multiline
            value={shot.imagePrompt}
            onChangeText={(t) => onChange({ ...shot, imagePrompt: t })}
            style={[styles.prompt, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.surface }]}
          />
        </View>
      </Row>
      {types.length > 1 ? <ChipRow<ShotType> options={types.map((t) => ({ value: t, label: SHOT_LABEL[t] }))} value={shot.type} onChange={(t) => onChange({ ...shot, type: t })} /> : null}
      <Button label="Redraw this shot" kind="ghost" small icon="refresh" disabled={busy || !canRedraw} onPress={onRedraw} />
    </Card>
  );
}

// Storyboard pictures need the session cookie.
function AuthImage({ path, style }: { path: string; style: object }) {
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    musicVideos.headers().then(setHeaders);
  }, []);
  const uri = musicVideos.uri(path);
  if (!uri || !headers) return <View style={style} />;
  return <Image source={{ uri, headers }} style={style} resizeMode="cover" accessibilityIgnoresInvertColors />;
}

const styles = StyleSheet.create({
  kind: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 76, padding: 14, borderRadius: radius.lg, borderWidth: 2 },
  kindIcon: { width: 36, textAlign: "center" },
  price: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  star: { width: 64, height: 64, borderRadius: 32 },
  video: { width: "100%", maxWidth: 420, alignSelf: "center", aspectRatio: 9 / 16, borderRadius: radius.lg, overflow: "hidden" },
  frame: { width: 96, aspectRatio: 9 / 16, borderRadius: radius.md, overflow: "hidden", justifyContent: "center" },
  tag: { position: "absolute", left: 6, top: 6, paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill },
  prompt: { minHeight: 72, borderWidth: 1, borderRadius: radius.md, padding: 8, fontFamily: fonts.regular, fontSize: 14, textAlignVertical: "top" },
});
