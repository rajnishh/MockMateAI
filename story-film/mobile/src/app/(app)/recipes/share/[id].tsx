import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Share, Switch, View } from "react-native";

import { PrivateList, RecipeHasList, ShapeList } from "@/components/recipes";
import { ReelThumb } from "@/components/reel-thumb";
import { Banner, Button, Card, Chip, Field, Header, Row, Screen, Skeleton, Txt, Win } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { handleHint } from "@/lib/listen";
import { FORMAT_WORD } from "@/lib/recipes";
import { useData } from "@/lib/use-data";
import { useTheme } from "@/theme";

type Step = "handle" | "share" | "done";

// Share a finished reel as a recipe (M2 to M4): pick an @name the first time, see what people get
// and what stays private, name it and tag up to 2 festivals, then share. The text safety check
// runs again on the server; if it fails nothing is shared and we say why.
export default function ShareRecipe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const draft = useData(() => api.recipeDraft(id, "en"));
  const me = useData(() => api.handle());
  const [stepChoice, setStep] = useState<Step | null>(null);
  const [handleInput, setHandle] = useState<string | null>(null);
  const [check, setCheck] = useState<{ handle: string; ok: boolean; problem: string | null } | null>(null);
  const [nameInput, setName] = useState<string | null>(null);
  const [occasions, setOccasions] = useState<string[]>([]);
  const [previewChoice, setPreview] = useState<boolean | null>(null);
  const [showShape, setShowShape] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ publicId: string; url: string } | null>(null);
  const d = draft.data;
  const step: Step | null = stepChoice ?? (me.data && d ? (me.data.handle ? "share" : "handle") : null);
  const handle = handleInput ?? me.data?.suggestions[0] ?? "";
  const name = nameInput ?? d?.suggestedName ?? "";
  // On by default only when no real person is in the reel.
  const preview = previewChoice ?? !d?.needsPreviewConsent;

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
      setStep("share");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.shareRecipe(id, { name: name.trim(), occasions, preview: preview ? "reel" : "look" }));
      setStep("done");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setStep("handle");
      setError(err instanceof ApiError ? err.message : "You're offline. Connect and try again.");
    } finally {
      setBusy(false);
    }
  }

  function toggle(slug: string) {
    setOccasions((o) => (o.includes(slug) ? o.filter((x) => x !== slug) : o.length >= 2 ? o : [...o, slug]));
  }

  const festival = d?.festivals?.find((f) => occasions.includes(f.slug) && !f.allYear);
  async function shareLink() {
    if (!result) return;
    const message = festival ? `Make your own ${festival.name} reel with my recipe: ${result.url}` : `Make your own reel with my recipe: ${result.url}`;
    await Share.share({ message, url: result.url }).catch(() => undefined);
  }

  const handleNow = me.data?.handle ?? clean;
  const loading = !d && !draft.error;
  return (
    <Screen
      footer={
        step === "share" && d?.eligible ? (
          <Button label={busy ? "Sharing…" : "Share recipe"} icon="recipe" block disabled={!name.trim()} loading={busy} onPress={share} />
        ) : undefined
      }>
      <Header title={step === "handle" ? "Pick your @name" : step === "done" ? "Your recipe is live" : "Share as a recipe"} back />
      {draft.error || me.error ? <Banner kind="error" text={draft.error ?? me.error ?? ""} action={<Button label="Try again" small kind="secondary" onPress={draft.reload} />} /> : null}
      {loading || !step ? (
        <>
          {loading ? <Txt variant="cap">Reading your reel…</Txt> : null}
          <Skeleton height={96} />
          <Skeleton height={180} />
        </>
      ) : d && !d.eligible ? (
        <Banner kind="warn" text={d.error ?? "This reel can't be shared as a recipe yet."} />
      ) : step === "handle" ? (
        <>
          <Txt>This is the name people see on your recipes and songs. You can change it once a month.</Txt>
          <Field label="Handle" value={handle} onChangeText={(v) => setHandle(v.replace(/\s/g, ""))} autoCapitalize="none" autoCorrect={false} maxLength={21} placeholder="meera.makes" />
          {hint ? (
            <Txt variant="cap" color="coralText">
              {hint}
            </Txt>
          ) : checked ? (
            <Txt variant="cap" color={checked.ok ? "tealText" : "coralText"}>
              {checked.ok ? `@${clean} is free` : checked.problem}
            </Txt>
          ) : null}
          {error ? <Banner kind="error" text={error} /> : null}
          <Button label="Continue" block disabled={!clean || Boolean(hint) || checked?.ok === false} loading={busy} onPress={saveHandle} />
        </>
      ) : step === "share" && d?.has ? (
        <>
          <Row style={{ flexWrap: "nowrap", alignItems: "center", gap: 12 }}>
            <ReelThumb width={54} />
            <View style={{ flex: 1 }}>
              <Txt variant="label" numberOfLines={2}>
                {name || "Your recipe"}
              </Txt>
              <Txt variant="cap">{[FORMAT_WORD[d.has.format], d.has.format === "story" ? d.has.styleLabel : null, `${d.has.durationSec} s`].filter(Boolean).join(" · ")}</Txt>
            </View>
          </Row>
          <Card>
            <Txt variant="md">What people get</Txt>
            <RecipeHasList has={d.has} />
            {d.has.format === "story" ? (
              <>
                <Button label={showShape ? "Hide the shape" : "See the shape"} kind="ghost" small onPress={() => setShowShape(!showShape)} style={{ alignSelf: "flex-start", paddingHorizontal: 0 }} />
                {showShape ? <ShapeList has={d.has} /> : null}
              </>
            ) : null}
          </Card>
          <Card flat>
            <Txt variant="md">What stays private</Txt>
            <PrivateList />
          </Card>
          <Field label="Recipe name" value={name} onChangeText={setName} maxLength={40} />
          <Txt variant="cap">{`People see this name. Keep it about the idea, not you. ${name.length}/40`}</Txt>
          <View style={{ gap: 6 }}>
            <Txt variant="cap">Good for (up to 2)</Txt>
            <Row>
              {(d.festivals ?? []).map((f) => (
                <Chip key={f.slug} label={f.name} selected={occasions.includes(f.slug)} onPress={() => toggle(f.slug)} />
              ))}
            </Row>
          </View>
          <Card flat>
            <Row style={{ alignItems: "center", gap: 12, flexWrap: "nowrap" }}>
              <View style={{ flex: 1 }}>
                <Txt variant="label">Show my reel as the preview</Txt>
                <Txt variant="cap">{d.needsPreviewConsent ? "It shows the people in your reel. Turn on only if they agreed to it being public." : "Off shows a still of its look instead."}</Txt>
              </View>
              <Switch accessibilityLabel="Show my reel as the preview" value={preview} onValueChange={setPreview} trackColor={{ true: colors.teal, false: colors.lineStrong }} />
            </Row>
          </Card>
          <Banner kind="info" text={`Your recipe shows Made with AI and @${handleNow}. Anyone with the link can see it. You earn 10% of the paid credits people spend on it. Stop sharing any time.`} />
          {error ? <Banner kind="error" text={error} /> : null}
        </>
      ) : result ? (
        <>
          <Win text="Your recipe is live" icon="recipe" />
          <Txt>{festival ? `People can find it in Recipes and in ${festival.name}.` : "People can find it in Recipes."}</Txt>
          <Button label="Share link" icon="share" block onPress={shareLink} />
          <Button label="See it" kind="secondary" block onPress={() => router.replace({ pathname: "/recipes/[publicId]", params: { publicId: result.publicId } })} />
          <Button label="Done" kind="ghost" block onPress={() => router.back()} />
        </>
      ) : null}
    </Screen>
  );
}
