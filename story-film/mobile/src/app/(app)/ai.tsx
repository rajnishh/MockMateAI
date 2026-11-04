import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, View } from "react-native";

import { Icon } from "@/components/icon";
import { Banner, Button, Card, Field, Header, ListRow, Screen, Skeleton, Txt } from "@/components/ui";
import { type AiChoice, aiNeedsKey, api } from "@/lib/api";
import { useTheme } from "@/theme";

const OTHER = "__other";

// Which AI answers in Ask Reelkar: Reelkar free, or one the creator brings their own key for.
export default function AiSettings() {
  const { colors } = useTheme();
  const [view, setView] = useState<AiChoice | null>(null);
  const [provider, setProvider] = useState("reelkar");
  const [model, setModel] = useState("");
  const [custom, setCustom] = useState("");
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .aiChoice()
      .then((v) => {
        setView(v);
        pick(v, v.provider);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  function pick(v: AiChoice, id: string) {
    const p = v.providers.find((x) => x.id === id);
    const savedModel = id === v.provider ? v.model : null;
    const listed = !!savedModel && !!p?.models.some((m) => m.id === savedModel);
    setProvider(id);
    setModel(savedModel && !listed ? OTHER : (savedModel ?? p?.models[0]?.id ?? ""));
    setCustom(savedModel && !listed ? savedModel : "");
    setKey("");
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.setAiChoice({ provider, model: model === OTHER ? custom.trim() : model, key: key.trim() || undefined });
      router.back();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!view) {
    return (
      <Screen>
        <Header title="Who answers you" back />
        {error ? <Banner kind="error" text={error} /> : <Skeleton height={240} />}
      </Screen>
    );
  }

  const chosen = view.providers.find((p) => p.id === provider) ?? view.providers[0];
  const keySaved = view.provider === chosen.id && !!view.keyHint;
  const needsKey = aiNeedsKey(chosen.id);
  const ready = (!needsKey || !!key.trim() || keySaved) && (model !== OTHER || !!custom.trim());

  return (
    <Screen
      footer={
        <Button
          label={chosen.id === "reelkar" ? "Use Reelkar free" : "Check and save"}
          block
          loading={saving}
          disabled={!ready || saving}
          onPress={save}
        />
      }
    >
      <Header title="Who answers you" sub="The AI that chats in Ask Reelkar" back />

      <Card flat>
        {view.providers.map((p) => (
          <ListRow
            key={p.id}
            title={p.name}
            sub={p.price}
            onPress={() => pick(view, p.id)}
            right={p.id === chosen.id ? <Icon name="check" color={colors.tealText} /> : <View />}
          />
        ))}
      </Card>

      {chosen.models.length > 0 && (
        <View style={{ gap: 6 }}>
          <Txt variant="cap">Model</Txt>
          <Card flat>
            {chosen.models.map((m) => (
              <ListRow
                key={m.id}
                title={m.label}
                onPress={() => setModel(m.id)}
                right={model === m.id ? <Icon name="check" color={colors.tealText} /> : <View />}
              />
            ))}
            {chosen.anyModel && (
              <ListRow
                title="Another model…"
                onPress={() => setModel(OTHER)}
                right={model === OTHER ? <Icon name="check" color={colors.tealText} /> : <View />}
              />
            )}
          </Card>
          {model === OTHER && (
            <Field label="Model id" value={custom} onChangeText={setCustom} placeholder={chosen.models[0]?.id} autoCapitalize="none" autoCorrect={false} maxLength={120} />
          )}
        </View>
      )}

      {needsKey && (
        <View style={{ gap: 6 }}>
          <Field
            label={`Your ${chosen.name} key`}
            value={key}
            onChangeText={setKey}
            placeholder={keySaved ? `Saved (${view.keyHint}). Paste a new one to replace it.` : "Paste your key"}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={300}
          />
          <Txt variant="cap">Stored encrypted and never shown again.</Txt>
          {chosen.keyUrl ? <Button label="Get a key" kind="ghost" small onPress={() => Linking.openURL(chosen.keyUrl!)} /> : null}
        </View>
      )}

      {chosen.id !== "reelkar" && (
        <Txt variant="cap">If it stops working (a wrong key or a used-up limit), Reelkar free answers and tells you why. Reels are still made the usual way.</Txt>
      )}
      {!view.ownKeys && <Banner kind="info" text="Using your own AI key isn't switched on for this server yet." />}
      {error && <Banner kind="error" text={error} />}
    </Screen>
  );
}
