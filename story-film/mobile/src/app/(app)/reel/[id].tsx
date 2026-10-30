import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useState } from "react";
import { Share, StyleSheet, View } from "react-native";

import { ReelThumb } from "@/components/reel-thumb";
import { Banner, Button, Card, Chip, ChipRow, Header, Row, Screen, Skeleton, Txt } from "@/components/ui";
import { api, type Account, type Film, type Platform, type PostCopy } from "@/lib/api";
import { PLATFORM_LABEL } from "@/lib/connect";
import { useData } from "@/lib/use-data";
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const [film, setFilm] = useState<Film | null>(null);
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [copy, setCopy] = useState<Record<string, PostCopy>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  const accounts = useData(() => api.accounts());
  const [picked, setPicked] = useState<string[] | null>(null);
  const [options] = useState(() => whenOptions(new Date()));
  const [when, setWhen] = useState<When>("now");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    api.film(id).then(setFilm, (e) => setError(e.message));
    api.videoHeaders().then(setHeaders);
  }, [id]);

  const url = film ? api.videoUrl(film) : null;
  // The video needs the session cookie, so wait for it before creating the source.
  const player = useVideoPlayer(url && headers ? { uri: url, headers } : null, (p) => {
    p.loop = true;
  });

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
        await api.createPost({
          filmId: id,
          socialAccountId: account.id,
          title: c.title || film?.title || "My reel",
          description: [c.caption, c.hashtags.join(" ")].filter(Boolean).join("\n\n"),
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
  const text = current ? [current.caption, current.hashtags.join(" ")].filter(Boolean).join("\n\n") : "";

  return (
    <Screen>
      <Header title={film?.title ?? "Your reel"} sub="Ready · Made with AI" back />
      <View style={styles.player}>
        {url && headers ? <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls /> : film ? <ReelThumb seed={0} playable /> : <Skeleton height={420} />}
      </View>
      {error ? <Banner kind="error" text={error} /> : null}
      {film?.error ? <Banner kind="warn" text={film.error} /> : null}
      {film?.format === "edit" ? (
        <Button label="Fine-tune effects" icon="edit" kind="secondary" block onPress={() => router.push(`/edit/${id}`)} />
      ) : null}
      {note ? <Banner kind="info" text={note} action={<Button label="Calendar" small kind="secondary" onPress={() => router.push("/calendar")} />} /> : null}

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
      <Button label="Share" icon="send" kind="secondary" block onPress={() => Share.share({ message: [film?.title, text, url].filter(Boolean).join("\n\n") }).catch(() => undefined)} />
      <Button label="Make another reel" kind="ghost" style={{ alignSelf: "center" }} onPress={() => router.replace("/create")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  player: { width: "70%", maxWidth: 320, aspectRatio: 9 / 16, alignSelf: "center", borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#0b1220" },
});
