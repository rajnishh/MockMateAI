import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import { Banner, Button, Card, ChipRow, Field, Header, Row, Screen, Skeleton, Txt } from "@/components/ui";
import { api, type EditCard, type EditDraft, type EditEffect, type EditOptions, type EditPlan, type EffectType, type Voice } from "@/lib/api";

const EFFECT_LABEL: Record<EffectType, string> = {
  backdrop: "Word behind you",
  spotlight: "Spotlight",
  cutout: "Sticker cut-out",
  stamp: "Stamp",
  focus: "Focus brackets",
};
const CARD_LABEL: Record<EditCard["type"], string> = { point: "Key point card", list: "List card", stat: "Number card", cta: "Ending card" };
// These need the person's outline, not just the face.
const NEEDS_OUTLINE = new Set<EffectType>(["backdrop", "spotlight", "cutout"]);

type Kind = "effect" | "card" | "zoom";
type Moment = { key: string; kind: Kind; index: number; start: number; end: number };

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// What the creator says during a moment, so they know which part of the video it is.
function said(words: EditDraft["words"], start: number, end: number): string {
  return words
    .filter((w) => w.end > start && w.start < end)
    .map((w) => w.word)
    .join(" ");
}

// A word to start from when switching to an effect that shows text: the longest word said then.
function keyWord(words: EditDraft["words"], start: number, end: number): string {
  const inSpan = words.filter((w) => w.end > start && w.start < end).map((w) => w.word.replace(/[^\p{L}\p{N}]/gu, ""));
  return (inSpan.sort((a, b) => b.length - a.length)[0] ?? "WOW").toUpperCase().slice(0, 16);
}

function swapEffect(e: EditEffect, type: EffectType, words: EditDraft["words"]): EditEffect {
  const span = { start: e.start, end: e.end };
  const text = "text" in e ? e.text : "label" in e && e.label ? e.label.toUpperCase().slice(0, 16) : keyWord(words, e.start, e.end);
  if (type === "backdrop" || type === "stamp") return { type, text, ...span };
  if (type === "focus") return { type, label: "label" in e ? e.label : undefined, ...span };
  return { type, ...span };
}

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;

export default function EditMoments() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [plan, setPlan] = useState<EditPlan | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [options, setOptions] = useState<EditOptions | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback((d: EditDraft) => {
    setDraft(d);
    setPlan(d.plan);
    setOptions(d.options);
    setOff(new Set());
  }, []);

  useEffect(() => {
    api.editDraft(id).then(reset, (e) => setError((e as Error).message));
  }, [id, reset]);

  if (!draft || !plan || !options) {
    return (
      <Screen>
        <Header title="Your video's effects" back />
        {error ? <Banner kind="error" text={error} /> : <Skeleton height={400} />}
      </Screen>
    );
  }

  const review = draft.status === "review";
  const canRender = review || (draft.rendersLeft ?? 0) > 0;
  const moments: Moment[] = [
    ...plan.effects.map((e, index) => ({ key: `e${index}`, kind: "effect" as const, index, start: e.start, end: e.end })),
    ...plan.cards.map((c, index) => ({ key: `c${index}`, kind: "card" as const, index, start: c.start, end: c.end })),
    ...plan.zooms.map((z, index) => ({ key: `z${index}`, kind: "zoom" as const, index, start: z.start, end: z.end })),
  ].sort((a, b) => a.start - b.start);
  const effectTypes = (Object.keys(EFFECT_LABEL) as EffectType[]).filter((t) => draft.available.mask || !NEEDS_OUTLINE.has(t));
  const activeCards = plan.cards.filter((_, i) => !off.has(`c${i}`));

  const setEffect = (i: number, e: EditEffect) => setPlan({ ...plan, effects: plan.effects.map((x, j) => (j === i ? e : x)) });
  const setCard = (i: number, c: EditCard) => setPlan({ ...plan, cards: plan.cards.map((x, j) => (j === i ? c : x)) });
  const toggle = (key: string) => {
    const next = new Set(off);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOff(next);
  };

  // Text the creator emptied: the video can't show it, so ask them to fill it or turn the moment off.
  const missing = moments.some((m) => {
    if (off.has(m.key)) return false;
    if (m.kind === "effect") {
      const e = plan.effects[m.index];
      return (e.type === "backdrop" || e.type === "stamp") && !e.text.trim();
    }
    if (m.kind === "card") {
      const c = plan.cards[m.index];
      if (c.type === "list") return !c.heading.trim() || c.items.filter((x) => x.trim()).length < 2;
      return c.type === "stat" ? !c.label.trim() : !c.text.trim();
    }
    return false;
  });

  async function render() {
    setBusy(true);
    setError(null);
    try {
      const kept: EditPlan = {
        ...plan!,
        effects: plan!.effects.filter((_, i) => !off.has(`e${i}`)).map((e) => ("text" in e ? { ...e, text: e.text.trim() } : e)),
        cards: plan!.cards
          .filter((_, i) => !off.has(`c${i}`))
          .map((c) => (c.type === "list" ? { ...c, items: c.items.map((x) => x.trim()).filter(Boolean) } : c)),
        zooms: plan!.zooms.filter((_, i) => !off.has(`z${i}`)),
      };
      await api.saveEdit(id, { plan: kept, ...options! });
      router.replace(`/making/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={
        <>
          <Button
            label={review ? "Render my video" : canRender ? `Render again · ${draft.rendersLeft} free left` : "No free re-renders left"}
            icon="sparkle"
            block
            disabled={!canRender || missing}
            loading={busy}
            onPress={render}
          />
          <Txt variant="cap" style={{ textAlign: "center" }}>
            {missing ? "Fill in the empty text, or turn that moment off" : review ? "About as long as your video · you can leave this screen" : "Your current video stays until the new one is ready"}
          </Txt>
        </>
      }>
      <Header
        title={review ? "Check your effects" : "Fine-tune"}
        sub="Turn moments off, swap effects or fix the words"
        back
        right={<Button label="Reset" small kind="ghost" icon="refresh" onPress={() => reset(draft)} />}
      />
      {error ? <Banner kind="error" text={error} /> : null}
      {!draft.available.faces ? <Banner kind="info" text="We couldn't find your face in this video, so effects around you are off. Zooms, cards and captions still work." /> : null}

      {moments.length === 0 ? <Txt variant="cap">The AI kept this video plain. You can still change the captions, sounds and voice below.</Txt> : null}
      {moments.map((m) => {
        const isOff = off.has(m.key);
        const title =
          m.kind === "effect" ? EFFECT_LABEL[plan.effects[m.index].type] : m.kind === "card" ? CARD_LABEL[plan.cards[m.index].type] : "Zoom in";
        const quote = said(draft.words, m.start, m.end);
        return (
          <Card key={m.key} flat={isOff}>
            <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="label">{title}</Txt>
                <Txt variant="cap">
                  {clock(m.start)}–{clock(m.end)}
                  {quote ? ` · “${quote}”` : ""}
                </Txt>
              </View>
              <ChipRow<"on" | "off">
                options={[
                  { value: "on", label: "On" },
                  { value: "off", label: "Off" },
                ]}
                value={isOff ? "off" : "on"}
                onChange={() => toggle(m.key)}
              />
            </Row>
            {isOff ? null : m.kind === "effect" ? (
              <EffectEditor
                effect={plan.effects[m.index]}
                types={effectTypes}
                hidden={(() => {
                  const e = plan.effects[m.index];
                  return (e.type === "backdrop" || e.type === "stamp") && activeCards.some((c) => overlaps(c, e));
                })()}
                onChange={(e) => setEffect(m.index, e)}
                onSwap={(t) => setEffect(m.index, swapEffect(plan.effects[m.index], t, draft.words))}
              />
            ) : m.kind === "card" ? (
              <CardEditor card={plan.cards[m.index]} onChange={(c) => setCard(m.index, c)} />
            ) : null}
          </Card>
        );
      })}

      <Card>
        <Txt variant="md">Sound and captions</Txt>
        <Row style={{ gap: 16, alignItems: "flex-start" }}>
          <View style={{ gap: 6 }}>
            <Txt variant="cap">Captions</Txt>
            <ChipRow<"on" | "off">
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
              value={options.captions ? "on" : "off"}
              onChange={(v) => setOptions({ ...options, captions: v === "on" })}
            />
          </View>
          <View style={{ gap: 6 }}>
            <Txt variant="cap">Sound effects</Txt>
            <ChipRow<"on" | "off">
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
              value={options.sounds ? "on" : "off"}
              onChange={(v) => setOptions({ ...options, sounds: v === "on" })}
            />
          </View>
        </Row>
        <Txt variant="cap">Your voice</Txt>
        <ChipRow<Voice>
          options={[
            { value: "natural", label: "As recorded" },
            { value: "clear", label: "Clear" },
            { value: "deeper", label: "Deeper" },
          ]}
          value={options.voice}
          onChange={(voice) => setOptions({ ...options, voice })}
        />
      </Card>
    </Screen>
  );
}

function EffectEditor({
  effect,
  types,
  hidden,
  onChange,
  onSwap,
}: {
  effect: EditEffect;
  types: EffectType[];
  hidden: boolean;
  onChange: (e: EditEffect) => void;
  onSwap: (t: EffectType) => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <ChipRow<EffectType> options={types.map((t) => ({ value: t, label: EFFECT_LABEL[t] }))} value={effect.type} onChange={onSwap} />
      {effect.type === "backdrop" || effect.type === "stamp" ? (
        <Field
          label={effect.type === "backdrop" ? "Word behind you" : "Stamp text"}
          value={effect.text}
          maxLength={16}
          autoCapitalize="characters"
          onChangeText={(text) => onChange({ ...effect, text })}
        />
      ) : null}
      {effect.type === "focus" ? (
        <Field label="Label (optional)" value={effect.label ?? ""} maxLength={24} onChangeText={(label) => onChange({ ...effect, label: label || undefined })} />
      ) : null}
      {hidden ? <Txt variant="cap" color="warning">A card shows at the same time, so this won&apos;t appear. Turn that card off to use it.</Txt> : null}
    </View>
  );
}

function CardEditor({ card, onChange }: { card: EditCard; onChange: (c: EditCard) => void }) {
  if (card.type === "point") return <Field label="Text" value={card.text} maxLength={60} onChangeText={(text) => onChange({ ...card, text })} />;
  if (card.type === "cta") {
    return (
      <>
        <Field label="Text" value={card.text} maxLength={50} onChangeText={(text) => onChange({ ...card, text })} />
        <Field label="Button (optional)" value={card.action ?? ""} maxLength={30} onChangeText={(action) => onChange({ ...card, action: action || undefined })} />
      </>
    );
  }
  if (card.type === "stat") {
    return (
      <>
        <Txt variant="label">
          {card.prefix ?? ""}
          {card.value}
          {card.suffix ?? ""}
        </Txt>
        <Field label="Label" value={card.label} maxLength={50} onChangeText={(label) => onChange({ ...card, label })} />
      </>
    );
  }
  return (
    <>
      <Field label="Heading" value={card.heading} maxLength={40} onChangeText={(heading) => onChange({ ...card, heading })} />
      {card.items.map((item, i) => (
        <Field
          key={i}
          label={`Item ${i + 1}`}
          value={item}
          maxLength={40}
          onChangeText={(v) => onChange({ ...card, items: card.items.map((x, j) => (j === i ? v : x)) })}
        />
      ))}
    </>
  );
}
