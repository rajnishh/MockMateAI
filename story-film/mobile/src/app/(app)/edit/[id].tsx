import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { EditPreview, usePreviewClock } from "@/components/edit-preview";
import { EditTimeline } from "@/components/edit-timeline";
import { Banner, Button, Card, ChipRow, Field, Header, Row, Screen, Skeleton, Txt } from "@/components/ui";
import { api, type EditCard, type EditDraft, type EditEffect, type EditOptions, type EditPlan, type EffectType, type Span, type Voice } from "@/lib/api";
import {
  captionLines,
  conflicts,
  type DragMode,
  dragSpan,
  dragWord,
  editLine,
  formatTime,
  MAX_COUNT,
  type MomentKind,
  moveSpan,
  newSpan,
  resizeSpan,
  snapPoints,
  STEP,
  WORD_STEP,
} from "@/lib/moments";
import { useSession } from "@/lib/session";

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
// What can be added by hand ("e:" effects, "c:" cards, "z" zoom). Number cards need a number
// the creator said, so only the AI adds them.
type AddType = `e:${EffectType}` | "c:point" | "c:list" | "c:cta" | "z";

type Words = EditDraft["words"];
type Moment = { key: string; kind: MomentKind; index: number; start: number; end: number };

// What the creator says during a moment, so they know which part of the video it is.
function said(words: Words, start: number, end: number): string {
  return words
    .filter((w) => w.end > start && w.start < end)
    .map((w) => w.word)
    .join(" ");
}

// A word to start from for an effect that shows text: the longest word said then.
function keyWord(words: Words, start: number, end: number): string {
  const inSpan = words.filter((w) => w.end > start && w.start < end).map((w) => w.word.replace(/[^\p{L}\p{N}]/gu, ""));
  return (inSpan.sort((a, b) => b.length - a.length)[0] || "WOW").toUpperCase().slice(0, 16);
}

function makeEffect(type: EffectType, span: Span, words: Words, from?: EditEffect): EditEffect {
  const text = from && "text" in from ? from.text : from && "label" in from && from.label ? from.label.toUpperCase().slice(0, 16) : keyWord(words, span.start, span.end);
  if (type === "backdrop" || type === "stamp") return { type, text, ...span };
  if (type === "focus") return { type, label: from && "label" in from ? from.label : undefined, ...span };
  return { type, ...span };
}

function makeCard(type: "point" | "list" | "cta", span: Span, words: Words): EditCard {
  if (type === "point") return { type, text: said(words, span.start, span.end).slice(0, 60), ...span };
  if (type === "list") return { type, heading: "", items: ["", ""], ...span };
  return { type, text: "Follow for more", ...span };
}

export default function EditMoments() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [plan, setPlan] = useState<EditPlan | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [options, setOptions] = useState<EditOptions | null>(null);
  // Caption words with their times: the creator can fix the text and retime each word.
  const [capWords, setCapWords] = useState<Words>([]);
  // The caption line being typed in; it is applied to the words when the field loses focus.
  const [editing, setEditing] = useState<{ from: number; text: string } | null>(null);
  const [addType, setAddType] = useState<AddType>("z");
  const [addAt, setAddAt] = useState("0");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  const { prefs } = useSession();
  const clock = usePreviewClock(draft ? api.previewUri(draft) : null, headers, draft?.durationSec ?? 1);

  useEffect(() => {
    api.videoHeaders().then(setHeaders);
  }, []);

  const lines = useMemo(() => captionLines(capWords), [capWords]);

  const reset = useCallback((d: EditDraft) => {
    setDraft(d);
    setPlan(d.plan);
    setOptions(d.options);
    setOff(new Set());
    setCapWords(d.words);
    setEditing(null);
    setNote(null);
    setSelected(null);
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

  const duration = draft.durationSec;
  // The words including a line still being typed.
  const editingLine = editing ? lines.find((l) => l.from === editing.from) : undefined;
  const words = editing && editingLine ? editLine(capWords, editingLine, editing.text) : capWords;
  const captionsChanged = words !== draft.words;
  const review = draft.status === "review";
  const canRender = review || (draft.rendersLeft ?? 0) > 0;
  const moments: Moment[] = [
    ...plan.effects.map((e, index) => ({ key: `e${index}`, kind: "effect" as const, index, start: e.start, end: e.end })),
    ...plan.cards.map((c, index) => ({ key: `c${index}`, kind: "card" as const, index, start: c.start, end: c.end })),
    ...plan.zooms.map((z, index) => ({ key: `z${index}`, kind: "zoom" as const, index, start: z.start, end: z.end })),
  ].sort((a, b) => a.start - b.start);
  const effectTypes = draft.available.faces ? (Object.keys(EFFECT_LABEL) as EffectType[]).filter((t) => draft.available.mask || !NEEDS_OUTLINE.has(t)) : [];
  const problems = conflicts(plan, off);

  const setEffect = (i: number, e: EditEffect) => setPlan({ ...plan, effects: plan.effects.map((x, j) => (j === i ? e : x)) });
  const setCard = (i: number, c: EditCard) => setPlan({ ...plan, cards: plan.cards.map((x, j) => (j === i ? c : x)) });
  const setSpan = (m: Moment, span: Span) => {
    if (m.kind === "effect") setEffect(m.index, { ...plan.effects[m.index], ...span });
    else if (m.kind === "card") setCard(m.index, { ...plan.cards[m.index], ...span });
    else setPlan({ ...plan, zooms: plan.zooms.map((z, j) => (j === m.index ? span : z)) });
  };
  const toggle = (key: string) => {
    const next = new Set(off);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOff(next);
  };
  const onCount = (kind: MomentKind) => moments.filter((m) => m.kind === kind && !off.has(m.key)).length;

  // When a new moment can start: at each caption line, or every 2 seconds if nothing is said.
  const when = [{ value: "playhead", label: `At the playhead · ${formatTime(clock.time)}` }].concat(
    lines.length
      ? lines.map((l) => ({ value: String(l.start), label: `${formatTime(l.start)} “${l.text.split(" ").slice(0, 4).join(" ")}…”` }))
      : Array.from({ length: Math.max(1, Math.floor(duration / 2)) }, (_, i) => ({ value: String(i * 2), label: formatTime(i * 2) })),
  );
  const addKind: MomentKind = addType === "z" ? "zoom" : addType.startsWith("e:") ? "effect" : "card";
  const addFull = onCount(addKind) >= MAX_COUNT[addKind];
  const at = when.some((w) => w.value === addAt) ? addAt : when[0].value;

  function add() {
    const span = newSpan(addKind, at === "playhead" ? clock.time : Number(at), duration);
    let key: string;
    if (addType === "z") {
      key = `z${plan!.zooms.length}`;
      setPlan({ ...plan!, zooms: [...plan!.zooms, span] });
    } else if (addType.startsWith("e:")) {
      key = `e${plan!.effects.length}`;
      setPlan({ ...plan!, effects: [...plan!.effects, makeEffect(addType.slice(2) as EffectType, span, words)] });
    } else {
      key = `c${plan!.cards.length}`;
      setPlan({ ...plan!, cards: [...plan!.cards, makeCard(addType.slice(2) as "point" | "list" | "cta", span, words)] });
    }
    setSelected(key);
    clock.seek(span.start);
    setNote(`Added at ${formatTime(span.start)}. It's selected on the timeline above.`);
  }

  const labelOf = (m: Moment) =>
    m.kind === "effect" ? EFFECT_LABEL[plan.effects[m.index].type] : m.kind === "card" ? CARD_LABEL[plan.cards[m.index].type] : "Zoom in";
  const select = (key: string) => {
    setSelected(key);
    const m = moments.find((x) => x.key === key);
    if (m) clock.seek(m.start);
    else if (key[0] === "w") clock.seek(capWords[Number(key.slice(1))]?.start ?? clock.time);
  };
  const wordIndex = selected?.[0] === "w" ? Number(selected.slice(1)) : -1;
  const word = wordIndex >= 0 ? capWords[wordIndex] : undefined;
  const retime = (i: number, origin: Span, mode: DragMode, delta: number) => {
    const next = dragWord(capWords, i, origin, mode, delta, duration);
    setCapWords(next);
    clock.seek(mode === "end" ? next[i].end : next[i].start);
  };
  const current = moments.find((m) => m.key === selected) ?? null;
  const at_ = current ? moments.indexOf(current) : -1;

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
      await api.saveEdit(id, { plan: kept, ...options!, ...(captionsChanged ? { words } : {}) });
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
            disabled={!canRender || missing || problems.size > 0}
            loading={busy}
            onPress={render}
          />
          <Txt variant="cap" style={{ textAlign: "center" }}>
            {problems.size
              ? "Fix the moments marked in red, or turn them off"
              : missing
                ? "Fill in the empty text, or turn that moment off"
                : review
                  ? "About as long as your video · you can leave this screen"
                  : "Your current video stays until the new one is ready"}
          </Txt>
        </>
      }>
      <Header
        title={review ? "Check your effects" : "Fine-tune"}
        sub="Move, stretch, swap or add moments, and fix your captions"
        back
        right={<Button label="Reset" small kind="ghost" icon="refresh" onPress={() => reset(draft)} />}
      />
      {error ? <Banner kind="error" text={error} /> : null}
      {!draft.available.faces ? <Banner kind="info" text="We couldn't find your face in this video, so effects around you are off. Zooms, cards and captions still work." /> : null}

      <EditPreview
        player={clock.player}
        time={clock.time}
        plan={plan}
        off={off}
        words={words}
        lines={lines}
        faces={draft.faces ?? null}
        captions={options.captions}
        accent={prefs?.brand?.accent ?? "#2BC4B4"}
      />
      <Row style={{ justifyContent: "center", alignItems: "center", gap: 12 }}>
        <Button label={clock.playing ? "Pause" : "Play"} small kind="secondary" onPress={clock.toggle} />
        <Txt variant="cap">
          {formatTime(clock.time)} / {formatTime(duration)}
        </Txt>
      </Row>
      <Txt variant="cap" style={{ textAlign: "center" }}>
        A rough preview: in the final video, words and effects sit around you.
      </Txt>

      <EditTimeline
        duration={duration}
        moments={moments.map((m) => ({ key: m.key, kind: m.kind, label: labelOf(m), start: m.start, end: m.end, off: off.has(m.key), problem: problems.get(m.key) }))}
        lines={lines}
        words={capWords}
        snaps={snapPoints(words)}
        time={clock.time}
        playing={clock.playing}
        selected={selected}
        onSelect={select}
        onSeek={clock.seek}
        onChange={(key, origin, mode, delta) => {
          const m = moments.find((x) => x.key === key);
          if (!m) return;
          const span = dragSpan(origin, mode, delta, m.kind, duration, snapPoints(words));
          setSpan(m, span);
          clock.seek(mode === "end" ? span.end : span.start);
        }}
        onWordDrag={retime}
      />
      <Txt variant="cap">Drag a block to move it, or drag its edges to stretch it. Tap the ruler to move the playhead.</Txt>

      {word ? (
        <Card>
          <Txt variant="label">Caption word “{word.word}”</Txt>
          <Txt variant="cap">
            {formatTime(word.start)}–{formatTime(word.end)} · shows while you say it
          </Txt>
          <Row style={{ alignItems: "center", gap: 8 }}>
            <Txt variant="cap" style={{ width: 110 }}>
              Starts {formatTime(word.start)}
            </Txt>
            <Button label="Earlier" small kind="secondary" onPress={() => retime(wordIndex, word, "move", -WORD_STEP)} />
            <Button label="Later" small kind="secondary" onPress={() => retime(wordIndex, word, "move", WORD_STEP)} />
          </Row>
          <Row style={{ alignItems: "center", gap: 8 }}>
            <Txt variant="cap" style={{ width: 110 }}>
              Lasts {(word.end - word.start).toFixed(2)} s
            </Txt>
            <Button label="Shorter" small kind="secondary" onPress={() => retime(wordIndex, word, "end", -WORD_STEP)} />
            <Button label="Longer" small kind="secondary" onPress={() => retime(wordIndex, word, "end", WORD_STEP)} />
          </Row>
          <Row style={{ justifyContent: "space-between" }}>
            <Button label="Previous word" small kind="ghost" disabled={wordIndex <= 0} onPress={() => select(`w${wordIndex - 1}`)} />
            <Button label="Next word" small kind="ghost" disabled={wordIndex >= capWords.length - 1} onPress={() => select(`w${wordIndex + 1}`)} />
          </Row>
        </Card>
      ) : current ? (
        (() => {
          const m = current;
          const isOff = off.has(m.key);
          const problem = problems.get(m.key);
          const quote = said(words, m.start, m.end);
          return (
            <Card>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="label">{labelOf(m)}</Txt>
                  <Txt variant="cap">
                    {formatTime(m.start)}–{formatTime(m.end)}
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
              {isOff ? null : (
                <>
                  <Timing moment={m} duration={duration} onChange={(span) => setSpan(m, span)} />
                  {problem ? (
                    <Txt variant="cap" color="danger">
                      {problem}
                    </Txt>
                  ) : null}
                  {m.kind === "effect" ? (
                    <EffectEditor
                      effect={plan.effects[m.index]}
                      types={effectTypes}
                      onChange={(e) => setEffect(m.index, e)}
                      onSwap={(t) => setEffect(m.index, makeEffect(t, { start: m.start, end: m.end }, words, plan.effects[m.index]))}
                    />
                  ) : m.kind === "card" ? (
                    <CardEditor card={plan.cards[m.index]} onChange={(c) => setCard(m.index, c)} />
                  ) : null}
                </>
              )}
              <Row style={{ justifyContent: "space-between" }}>
                <Button label="Previous" small kind="ghost" disabled={at_ <= 0} onPress={() => select(moments[at_ - 1].key)} />
                <Button label="Next" small kind="ghost" disabled={at_ >= moments.length - 1} onPress={() => select(moments[at_ + 1].key)} />
              </Row>
            </Card>
          );
        })()
      ) : (
        <Card flat>
          <Txt variant="cap">
            {moments.length ? "Tap a block on the timeline to change it." : "No moments yet. Add one below."}
            {problems.size ? ` ${problems.size} ${problems.size === 1 ? "moment needs" : "moments need"} fixing: the red blocks.` : ""}
          </Txt>
          {moments.length ? <Button label="Edit the first moment" small kind="secondary" onPress={() => select(moments[0].key)} /> : null}
        </Card>
      )}

      <Card>
        <Txt variant="md">Add a moment</Txt>
        <ChipRow<AddType>
          options={[
            ...effectTypes.map((t) => ({ value: `e:${t}` as AddType, label: EFFECT_LABEL[t] })),
            { value: "c:point", label: CARD_LABEL.point },
            { value: "c:list", label: CARD_LABEL.list },
            { value: "c:cta", label: CARD_LABEL.cta },
            { value: "z", label: "Zoom in" },
          ]}
          value={addType}
          onChange={setAddType}
        />
        <Txt variant="cap">When</Txt>
        <ChipRow options={when} value={at} onChange={setAddAt} />
        <Button
          label={addFull ? `${MAX_COUNT[addKind]} is the most for this kind` : "Add"}
          icon="plus"
          kind="secondary"
          disabled={addFull}
          onPress={add}
        />
        {note ? <Txt variant="cap">{note}</Txt> : null}
      </Card>

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

      {options.captions && lines.length ? (
        <Card>
          <Txt variant="md">Caption words</Txt>
          <Txt variant="cap">Fix any word we heard wrong. Clear a line to hide it. To change when words show, zoom into the timeline.</Txt>
          {lines.map((l) => (
            <Field
              key={l.from}
              label={formatTime(l.start)}
              value={editing?.from === l.from ? editing.text : l.text}
              onChangeText={(text) => setEditing({ from: l.from, text })}
              onBlur={() => {
                if (editing?.from !== l.from) return;
                setCapWords(editLine(capWords, l, editing.text));
                setEditing(null);
              }}
            />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

// Moves a moment earlier or later, and makes it shorter or longer, a quarter second at a time.
function Timing({ moment, duration, onChange }: { moment: Moment; duration: number; onChange: (s: Span) => void }) {
  const span = { start: moment.start, end: moment.end };
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ alignItems: "center", gap: 8 }}>
        <Txt variant="cap" style={{ width: 110 }}>
          Starts {formatTime(moment.start)}
        </Txt>
        <Button label="Earlier" small kind="secondary" disabled={moment.start <= 0} onPress={() => onChange(moveSpan(span, -STEP, duration))} />
        <Button label="Later" small kind="secondary" disabled={moment.end >= duration} onPress={() => onChange(moveSpan(span, STEP, duration))} />
      </Row>
      <Row style={{ alignItems: "center", gap: 8 }}>
        <Txt variant="cap" style={{ width: 110 }}>
          Lasts {(moment.end - moment.start).toFixed(2)} s
        </Txt>
        <Button label="Shorter" small kind="secondary" onPress={() => onChange(resizeSpan(span, -STEP, moment.kind, duration))} />
        <Button label="Longer" small kind="secondary" onPress={() => onChange(resizeSpan(span, STEP, moment.kind, duration))} />
      </Row>
    </View>
  );
}

function EffectEditor({ effect, types, onChange, onSwap }: { effect: EditEffect; types: EffectType[]; onChange: (e: EditEffect) => void; onSwap: (t: EffectType) => void }) {
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
      {card.items.length < 4 ? <Button label="Add item" small kind="ghost" icon="plus" onPress={() => onChange({ ...card, items: [...card.items, ""] })} /> : null}
    </>
  );
}
