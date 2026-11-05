import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Switch, View } from "react-native";

import { Icon, type IconName } from "@/components/icon";
import { Banner, Button, Card, Field, Header, ListRow, Screen, Skeleton, Txt } from "@/components/ui";
import { type AiEngine, type AiEngines, type AiProvider, type EngineStatus, MAX_AI_ENGINES, aiNeedsKey, api } from "@/lib/api";
import { type Colors, fonts, radius, space, useTheme } from "@/theme";

const OTHER = "__other";

// "Resting until 5:30 AM", in the creator's own time; "tomorrow" when it isn't today.
function restingText(until: number | null) {
  if (!until) return "Resting for now";
  const d = new Date(until);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (d.toDateString() === now.toDateString()) return `Resting until ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Resting until tomorrow, ${time}`;
  return `Resting until ${d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}

function StatusPill({ status, restUntil, off }: { status: EngineStatus; restUntil: number | null; off?: boolean }) {
  const { colors } = useTheme();
  const look = off
    ? { bg: colors.surfaceSunken, fg: colors.inkMuted, text: "Off" }
    : status === "resting"
      ? { bg: colors.surfaceSunken, fg: colors.warning, text: restingText(restUntil) }
      : status === "key"
        ? { bg: colors.coralTint, fg: colors.danger, text: "Key not working" }
        : { bg: colors.tealTint, fg: colors.tealText, text: "Ready" };
  return (
    <View style={[styles.pill, { backgroundColor: look.bg }]}>
      <Txt variant="cap" style={{ color: look.fg, fontFamily: fonts.bold, fontSize: 12 }}>
        {look.text}
      </Txt>
    </View>
  );
}

// A 44pt square icon button for the row controls.
function IconButton({ icon, label, onPress, disabled, color, rotate }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; color: string; rotate?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.iconBtn, { borderColor: colors.line, opacity: disabled ? 0.35 : pressed ? 0.6 : 1 }]}
    >
      <View style={rotate ? { transform: [{ rotate }] } : undefined}>
        <Icon name={icon} size={20} color={color} />
      </View>
    </Pressable>
  );
}

function modelLabel(providers: AiProvider[], e: AiEngine) {
  return providers.find((p) => p.id === e.provider)?.models.find((m) => m.id === e.model)?.label ?? e.model;
}

// Add an engine, or change one's model, key or extra value. Both are checked on the server first.
function EngineForm({
  providers,
  engine,
  onDone,
  onCancel,
}: {
  providers: AiProvider[];
  engine?: AiEngine;
  onDone: (view: AiEngines) => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const [providerId, setProviderId] = useState(engine?.provider ?? providers[0]?.id ?? "");
  const p = providers.find((x) => x.id === providerId);
  const listed = (pr: AiProvider | undefined, id: string) => !!pr?.models.some((m) => m.id === id);
  const [model, setModel] = useState(() => (engine ? (listed(p, engine.model) ? engine.model : OTHER) : (p?.models[0]?.id ?? "")));
  const [custom, setCustom] = useState(engine && !listed(p, engine.model) ? engine.model : "");
  const [key, setKey] = useState("");
  const [extra, setExtra] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(id: string) {
    const next = providers.find((x) => x.id === id);
    setProviderId(id);
    setModel(next?.models[0]?.id ?? (next?.anyModel ? OTHER : ""));
    setCustom("");
    setKey("");
    setExtra("");
    setError(null);
  }

  if (!p) return <Banner kind="error" text="This AI isn't offered on this server any more. You can remove it." />;
  const needsKey = aiNeedsKey(p.id);
  const chosenModel = model === OTHER ? custom.trim() : model;
  const changed = engine ? (chosenModel !== engine.model && !!chosenModel) || !!key.trim() || !!extra.trim() : true;
  const ready = engine ? changed : (!needsKey || !!key.trim()) && (!p.extra || !!extra.trim()) && (model !== OTHER || !!custom.trim());

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const view = engine
        ? await api.changeAiEngine(engine.id, {
            model: chosenModel && chosenModel !== engine.model ? chosenModel : undefined,
            key: key.trim() || undefined,
            extra: extra.trim() || undefined,
          })
        : await api.addAiEngine({ provider: p!.id, model: chosenModel || undefined, key: key.trim() || undefined, extra: extra.trim() || undefined });
      onDone(view);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ gap: space[3] }}>
      {!engine && (
        <View style={{ gap: 6 }}>
          <Txt variant="cap" style={{ fontFamily: fonts.bold }}>
            Which AI
          </Txt>
          <Card flat>
            {providers.map((x) => (
              <ListRow
                key={x.id}
                title={x.name}
                sub={x.chat ? x.price : `${x.price}. Not used for chat.`}
                onPress={() => pick(x.id)}
                right={x.id === p.id ? <Icon name="check" color={colors.tealText} /> : <View style={{ width: 24 }} />}
              />
            ))}
          </Card>
        </View>
      )}

      {(p.models.length > 0 || p.anyModel) && (
        <View style={{ gap: 6 }}>
          <Txt variant="cap" style={{ fontFamily: fonts.bold }}>
            Model
          </Txt>
          <Card flat>
            {p.models.map((m) => (
              <ListRow key={m.id} title={m.label} onPress={() => setModel(m.id)} right={model === m.id ? <Icon name="check" color={colors.tealText} /> : <View style={{ width: 24 }} />} />
            ))}
            {p.anyModel && (
              <ListRow title="Another model…" onPress={() => setModel(OTHER)} right={model === OTHER ? <Icon name="check" color={colors.tealText} /> : <View style={{ width: 24 }} />} />
            )}
          </Card>
          {model === OTHER && (
            <Field label="Model id" value={custom} onChangeText={setCustom} placeholder={p.models[0]?.id ?? "Model id"} autoCapitalize="none" autoCorrect={false} maxLength={120} />
          )}
        </View>
      )}

      {needsKey && (
        <View style={{ gap: 6 }}>
          <Field
            label={engine ? `New ${p.name} key (optional)` : `Your ${p.name} key`}
            value={key}
            onChangeText={setKey}
            placeholder={engine?.keyHint ? `Saved (${engine.keyHint}). Paste a new one to replace it.` : "Paste your key"}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="none"
            maxLength={300}
          />
          {p.keyUrl ? <Button label="Get a free key" icon="link" kind="ghost" onPress={() => Linking.openURL(p.keyUrl!)} /> : null}
        </View>
      )}

      {p.extra && (
        <Field
          label={engine ? `${p.extra.label} (optional)` : p.extra.label}
          value={extra}
          onChangeText={setExtra}
          placeholder={engine ? "Saved. Type a new one to change it." : p.extra.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={120}
        />
      )}

      {error && <Banner kind="error" text={error} />}
      <View style={{ flexDirection: "row", gap: space[2], flexWrap: "wrap" }}>
        <Button
          label={saving ? (needsKey ? "Checking your key…" : "Checking…") : engine ? "Check and save" : "Check and connect"}
          loading={saving}
          disabled={!ready || saving}
          onPress={save}
        />
        <Button label="Cancel" kind="secondary" disabled={saving} onPress={onCancel} />
      </View>
    </View>
  );
}

function EngineRow({
  engine,
  index,
  providers,
  first,
  last,
  busy,
  editing,
  onToggle,
  onMove,
  onEdit,
  onRemove,
  onEdited,
  onCancelEdit,
}: {
  engine: AiEngine;
  index: number;
  providers: AiProvider[];
  first: boolean;
  last: boolean;
  busy: boolean;
  editing: boolean;
  onToggle: (on: boolean) => void;
  onMove: (by: -1 | 1) => void;
  onEdit: () => void;
  onRemove: () => void;
  onEdited: (view: AiEngines) => void;
  onCancelEdit: () => void;
}) {
  const { colors } = useTheme();
  const details = [modelLabel(providers, engine), engine.keyHint ? `key ${engine.keyHint}` : null].filter(Boolean).join(" · ");
  return (
    <View style={[styles.engine, { borderTopColor: colors.line }]}>
      <View style={styles.engineTop}>
        <Rank n={index + 1} colors={colors} />
        <View style={{ flex: 1, gap: 4, opacity: engine.enabled ? 1 : 0.6 }}>
          <Txt variant="label">{engine.name}</Txt>
          {details ? <Txt variant="cap">{details}</Txt> : null}
          <StatusPill status={engine.status} restUntil={engine.restUntil} off={!engine.enabled} />
          {!engine.chat && <Txt variant="cap">Not used for chat</Txt>}
        </View>
        <Switch
          accessibilityLabel={`Use ${engine.name}`}
          value={engine.enabled}
          disabled={busy}
          onValueChange={onToggle}
          trackColor={{ true: colors.tealText, false: colors.lineStrong }}
        />
      </View>
      {!editing && (
        <View style={styles.controls}>
          <IconButton icon="back" rotate="90deg" label={`Move ${engine.name} up`} disabled={busy || first} onPress={() => onMove(-1)} color={colors.ink} />
          <IconButton icon="back" rotate="-90deg" label={`Move ${engine.name} down`} disabled={busy || last} onPress={() => onMove(1)} color={colors.ink} />
          <View style={{ flex: 1 }} />
          <IconButton icon="edit" label={`Change ${engine.name}`} disabled={busy} onPress={onEdit} color={colors.ink} />
          <IconButton icon="trash" label={`Remove ${engine.name}`} disabled={busy} onPress={onRemove} color={colors.danger} />
        </View>
      )}
      {editing && <EngineForm providers={providers} engine={engine} onDone={onEdited} onCancel={onCancelEdit} />}
    </View>
  );
}

function Rank({ n, colors }: { n: number | null; colors: Colors }) {
  return (
    <View style={[styles.rank, { backgroundColor: n ? colors.surfaceSunken : colors.tealTint }]} accessibilityElementsHidden importantForAccessibility="no">
      {n ? (
        <Txt variant="label" style={{ fontSize: 14 }}>
          {n}
        </Txt>
      ) : (
        <Icon name="sparkle" size={16} color={colors.tealText} />
      )}
    </View>
  );
}

// "Your AI engines": the AI services every AI task tries in order, ending with Reelkar free.
export default function AiEnginesScreen() {
  const { colors } = useTheme();
  const [view, setView] = useState<AiEngines | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  function load() {
    api
      .aiEngines()
      .then(setView)
      .catch((e) => setLoadError((e as Error).message));
  }
  useEffect(load, []);

  async function run(id: string, action: () => Promise<AiEngines>) {
    setBusy(id);
    setError(null);
    try {
      setView(await action());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!view) {
    return (
      <Screen>
        <Header title="Your AI engines" back />
        {loadError ? <Banner kind="error" text={loadError} action={<Button label="Try again" kind="secondary" small onPress={() => (setLoadError(null), load())} />} /> : <Skeleton height={280} />}
      </Screen>
    );
  }

  // Without safe key storage on the server, only engines that need no key can be used.
  const providers = view.ownKeys ? view.providers : view.providers.filter((p) => !aiNeedsKey(p.id));
  const shown = view.ownKeys ? view.engines : view.engines.filter((e) => !aiNeedsKey(e.provider));
  const full = view.engines.length >= MAX_AI_ENGINES;

  function move(e: AiEngine, by: -1 | 1) {
    const at = shown.indexOf(e);
    const other = shown[at + by];
    if (!other || !view) return;
    const ids = view.engines.map((x) => x.id);
    const i = ids.indexOf(e.id);
    const j = ids.indexOf(other.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(e.id, () => api.orderAiEngines(ids));
  }

  function remove(e: AiEngine) {
    Alert.alert(`Remove ${e.name}?`, "Its key is deleted from Reelkar. You can add it again any time.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => run(e.id, () => api.removeAiEngine(e.id)) },
    ]);
  }

  return (
    <Screen>
      <Header title="Your AI engines" sub="For chat, lyrics, song checks, ideas, captions and scripts" back />

      <Txt variant="body">
        Connect free AI services with your own keys. Reelkar tries them top to bottom and switches to the next one when one runs out. Reelkar free is always there as the last one.
      </Txt>
      <View style={{ flexDirection: "row", gap: space[2], alignItems: "center" }}>
        <Icon name="lock" size={16} color={colors.inkMuted} />
        <Txt variant="cap" style={{ flex: 1 }}>
          Keys are stored encrypted. Only the last 4 characters are ever shown.
        </Txt>
      </View>

      {!view.ownKeys && (
        <Banner
          kind="info"
          text={
            providers.length
              ? "Using your own keys isn't available on this server yet. You can still use the engines below that need no key."
              : "Using your own keys isn't available on this server yet, so Reelkar free answers everything for now."
          }
        />
      )}
      {error && <Banner kind="error" text={error} />}

      <Card flat>
        {shown.map((e, i) => (
          <EngineRow
            key={e.id}
            engine={e}
            index={i}
            providers={view.providers}
            first={i === 0}
            last={i === shown.length - 1}
            busy={busy !== null}
            editing={editing === e.id}
            onToggle={(on) => run(e.id, () => api.changeAiEngine(e.id, { enabled: on }))}
            onMove={(by) => move(e, by)}
            onEdit={() => {
              setAdding(false);
              setEditing(e.id);
            }}
            onRemove={() => remove(e)}
            onEdited={(v) => {
              setView(v);
              setEditing(null);
            }}
            onCancelEdit={() => setEditing(null)}
          />
        ))}
        <View style={[styles.engine, { borderTopColor: shown.length ? colors.line : "transparent" }]} accessible accessibilityLabel={`Reelkar free, always on, last in line`}>
          <View style={styles.engineTop}>
            <Rank n={null} colors={colors} />
            <View style={{ flex: 1, gap: 4 }}>
              <Txt variant="label">Reelkar free · always on</Txt>
              <Txt variant="cap">{shown.length ? "Used when none of yours can answer" : "Answers everything until you connect your own"}</Txt>
              <StatusPill status={view.reelkar.status === "resting" ? "resting" : "ready"} restUntil={view.reelkar.restUntil} />
            </View>
          </View>
        </View>
      </Card>

      {shown.length === 0 && providers.length > 0 && !adding && (
        <Txt variant="cap">No engines of your own yet. Add one to get more free AI each day.</Txt>
      )}

      {providers.length > 0 &&
        (adding ? (
          <Card>
            <Txt variant="md">Add an engine</Txt>
            <EngineForm
              providers={providers}
              onDone={(v) => {
                setView(v);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          </Card>
        ) : full ? (
          <Txt variant="cap">You&apos;ve connected {MAX_AI_ENGINES} engines, the most you can. Remove one to add another.</Txt>
        ) : (
          <Button
            label="Add an engine"
            icon="plus"
            kind="secondary"
            block
            disabled={busy !== null}
            onPress={() => {
              setEditing(null);
              setAdding(true);
            }}
          />
        ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  engine: { gap: space[3], paddingVertical: space[3], borderTopWidth: StyleSheet.hairlineWidth },
  engineTop: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  rank: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 2 },
  pill: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2 },
  controls: { flexDirection: "row", alignItems: "center", gap: space[2], paddingLeft: 32 + space[3] },
  iconBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
