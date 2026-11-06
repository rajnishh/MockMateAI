import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { Celebrate } from "@/components/celebrate";
import { Icon } from "@/components/icon";
import { PushOffer } from "@/components/push-offer";
import { ShareAsRecipeCard } from "@/components/recipes";
import { confirmDelete } from "@/components/reel-grid";
import { ReelThumb } from "@/components/reel-thumb";
import { ReelVideo } from "@/components/reel-video";
import { Banner, Button, Card, Chip, ChipRow, Header, Row, Screen, Skeleton, Txt } from "@/components/ui";
import { api, type Account, type Duet, type Film, type FilmRecipe, type Platform, type PostCopy } from "@/lib/api";
import { PLATFORM_LABEL } from "@/lib/connect";
import { formatLabel } from "@/lib/formats";
import { saveReelToPhotos, shareReel } from "@/lib/reel-file";
import { useData } from "@/lib/use-data";
import { viewerList } from "@/lib/viewer-list";
import { radius } from "@/theme";

type When = "now" | "today" | "tomorrow-noon" | "tomorrow-evening";

// Times that work for most Indian creators; later these come from each account's insights.
function whenOptions(now: Date): { value: When; label: string; at: Date | null }[] {
  const at = (days: number, h: number, m: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const tonight = at(0, 19, 30);
  return [
    { value: "now", label: "Now", at: null },
    ...(tonight.getTime() - now.getTime() > 15 * 60_000 ? [{ value: "today" as const, label: "Today 7:30 pm", at: tonight }] : []),
    { value: "tomorrow-noon", label: "Tomorrow 1:00 pm", at: at(1, 13, 0) },
    { value: "tomorrow-evening", label: "Tomorrow 7:30 pm", at: at(1, 19, 30) },
  ];
}

export default function Reel() {
  const { id, new: fresh } = useLocalSearchParams<{ id: string; new?: string }>();
  const [film, setFilm] = useState<Film | null>(null);
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [copy, setCopy] = useState<Record<string, PostCopy>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  // Said no to Photos before: only Settings can change it now.
  const [photosBlocked, setPhotosBlocked] = useState(false);
  const accounts = useData(() => api.accounts());
  const [picked, setPicked] = useState<string[] | null>(null);
  const [options] = useState(() => whenOptions(new Date()));
  const [when, setWhen] = useState<When>("now");
  const [posting, setPosting] = useState(false);
  // A Jugalbandi's music video posts as an Instagram Collab with the partner, once both approved.
  const [duet, setDuet] = useState<Duet | null>(null);
  const [collab, setCollab] = useState(true);
  const collabWith = duet && duet.role === "a" && duet.approvedA && duet.approvedB ? duet.partnerIg : "";
  // Share as a recipe, or "Recipe by @maker" with a caption credit (on by default).
  const [recipeInfo, setRecipeInfo] = useState<FilmRecipe | null>(null);
  const [credit, setCredit] = useState(true);
  const recipeBy = film?.recipe?.handle ?? null;
  const recipeLine = recipeBy && credit ? `Recipe by @${recipeBy} on Reelkar` : "";

  useEffect(() => {
    api.film(id).then(setFilm, (e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    if (film?.songId) api.duetForSong(film.songId).then(setDuet, () => undefined);
  }, [film?.songId]);
  useEffect(() => {
    if (film?.status === "completed") api.filmRecipe(id).then(setRecipeInfo, () => undefined);
  }, [film?.status, id]);

  async function save() {
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      const result = await saveReelToPhotos(id);
      if (result === "saved") setNote("Saved to your Photos.");
      else if (result === "denied") setError("Reelkar needs permission to save to Photos.");
      else setPhotosBlocked(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function share() {
    setSharing(true);
    setError(null);
    try {
      // Instagram drops shared text, so the caption goes on the clipboard to paste.
      if (text) await Clipboard.setStringAsync(text);
      await shareReel(id, film?.title);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSharing(false);
    }
  }

  const connected: Account[] = (accounts.data?.accounts ?? []).filter((a) => !a.needsReconnect);
  const selected = picked ?? connected.map((a) => a.id);

  async function captionFor(p: Platform): Promise<PostCopy> {
    if (copy[p]) return copy[p];
    const c = await api.caption(id, p);
    setCopy((all) => ({ ...all, [p]: c }));
    return c;
  }

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

  async function post() {
    setPosting(true);
    setError(null);
    setNote(null);
    try {
      const at = options.find((o) => o.value === when)?.at;
      for (const account of connected.filter((a) => selected.includes(a.id))) {
        const c = await captionFor(account.platform);
        const withPartner = account.platform === "instagram" && collab && collabWith;
        // Credit the partner in the caption too (YouTube has no Collab, and it helps if Instagram's invite is missed).
        const credit = duet && duet.partnerName ? `with ${duet.partnerIg ? `@${duet.partnerIg}` : duet.partnerName} · Jugalbandi made on Reelkar` : recipeLine;
        await api.createPost({
          ...(withPartner ? { collaborators: [collabWith] } : {}),
          filmId: id,
          socialAccountId: account.id,
          title: c.title || film?.title || "My reel",
          description: [c.caption, credit, c.hashtags.join(" ")].filter(Boolean).join("\n\n"),
          tags: c.hashtags.map((h) => h.replace(/^#/, "")).slice(0, 15),
          scheduledAt: at?.toISOString(),
        });
      }
      setNote(at ? `Scheduled for ${options.find((o) => o.value === when)?.label}. See it in Calendar.` : "Posting now. It can take a few minutes to appear.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPosting(false);
    }
  }

  const current = copy[platform];
  const text = current ? [current.caption, recipeLine, current.hashtags.join(" ")].filter(Boolean).join("\n\n") : "";

  return (
    <Screen>
      <Header title={film?.title ?? "Your reel"} sub={["Ready", formatLabel(film?.format), "Made with AI", recipeBy ? `Recipe by @${recipeBy}` : null].filter(Boolean).join(" · ")} back />
      <View style={styles.player}>
        {film?.videoUrl ? <ReelVideo film={film} autoPlay={Boolean(fresh)} /> : film ? <ReelThumb seed={0} playable /> : <Skeleton height={420} />}
        {/* Straight from "Making your reel": celebrate once. */}
        {fresh && film ? <Celebrate /> : null}
        {film?.videoUrl ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Watch full screen"
            onPress={() => {
              viewerList.set([film]);
              router.push(`/watch/${film.id}`);
            }}
            style={styles.full}>
            <Icon name="expand" size={18} color="#ffffff" />
          </Pressable>
        ) : null}
      </View>
      <Row style={{ justifyContent: "center" }}>
        <Button label="Save to Photos" icon="download" kind="secondary" loading={saving} disabled={!film?.videoUrl} onPress={save} />
        <Button label="Share" icon="share" loading={sharing} disabled={!film?.videoUrl} onPress={share} />
      </Row>
      {error ? <Banner kind="error" text={error} /> : null}
      {photosBlocked ? (
        <Banner kind="warn" text="Allow Reelkar to add to Photos in Settings, then try again." action={<Button label="Settings" small kind="secondary" onPress={() => Linking.openSettings()} />} />
      ) : null}
      {film?.error ? <Banner kind="warn" text={film.error} /> : null}
      {fresh && film ? <PushOffer what="reel" /> : null}
      {film?.format === "edit" ? (
        <Button label="Fine-tune effects" icon="edit" kind="secondary" block onPress={() => router.push(`/edit/${id}`)} />
      ) : null}
      {note ? <Banner kind="info" text={note} action={note.includes("Calendar") ? <Button label="Calendar" small kind="secondary" onPress={() => router.push("/calendar")} /> : undefined} /> : null}

      <Card>
        <Txt variant="md">Post it</Txt>
        {accounts.data && connected.length === 0 ? (
          <>
            <Txt variant="cap">Connect Instagram or YouTube to post from here.</Txt>
            <Button label="Connect accounts" icon="link" onPress={() => router.push("/connections")} />
          </>
        ) : (
          <>
            <Row>
              {connected.map((a) => (
                <Chip
                  key={a.id}
                  label={`${PLATFORM_LABEL[a.platform]} · ${a.name}`}
                  selected={selected.includes(a.id)}
                  onPress={() => setPicked(selected.includes(a.id) ? selected.filter((x) => x !== a.id) : [...selected, a.id])}
                />
              ))}
            </Row>
            {collabWith ? <Chip label={`Instagram Collab with @${collabWith}`} selected={collab} onPress={() => setCollab(!collab)} /> : null}
            {collabWith && collab ? <Txt variant="cap">@{collabWith} gets an invite in Instagram; once they accept, it shows on both profiles.</Txt> : null}
            <Txt variant="cap">When</Txt>
            <ChipRow options={options.map((o) => ({ value: o.value, label: o.label }))} value={when} onChange={setWhen} />
            <Button
              label={when === "now" ? "Post now" : "Schedule"}
              icon={when === "now" ? "send" : "calendar"}
              block
              disabled={selected.length === 0}
              loading={posting}
              onPress={post}
            />
            <Txt variant="cap">Each platform gets its own AI caption, marked &quot;Made with AI&quot;.</Txt>
          </>
        )}
      </Card>

      {recipeInfo ? <ShareAsRecipeCard filmId={id} info={recipeInfo} /> : null}

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
        {recipeBy ? <Chip label={`Credit @${recipeBy}`} selected={credit} onPress={() => setCredit(!credit)} /> : null}
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
      <Button label="Make another reel" kind="ghost" style={{ alignSelf: "center" }} onPress={() => router.replace("/create")} />
      <Button label="Delete reel" icon="trash" kind="danger" block onPress={() => confirmDelete(id, () => router.replace("/reels"), (m) => setError(m), recipeInfo?.recipe?.state === "public")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  full: { position: "absolute", top: 10, left: 10, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(21,10,26,0.72)" },
  player: { width: "70%", maxWidth: 320, aspectRatio: 9 / 16, alignSelf: "center", borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#0b1220" },
});
