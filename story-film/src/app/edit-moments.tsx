"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  captionLines,
  conflicts,
  dragWord,
  editLine,
  formatTime,
  MAX_COUNT,
  type MomentKind,
  moveSpan,
  newSpan,
  resizeSpan,
  snapPoints,
  type Span,
  STEP,
  WORD_STEP,
} from "@/lib/edit/moments";
import type { Card, EditPlan, Effect } from "@/lib/edit/plan";
import { EditPreview, EditTimeline } from "./edit-timeline";

type EffectType = Effect["type"];
type Word = { word: string; start: number; end: number };
type Draft = {
  status: string;
  durationSec: number;
  plan: EditPlan;
  words: Word[];
  options: { captions: boolean; sounds: boolean; voice: string };
  available: { faces: boolean; mask: boolean };
  rendersLeft: number | null;
  previewUrl: string | null;
  faces: { rate: number; boxes: ([number, number, number, number] | null)[] } | null;
};

const EFFECT_LABEL: Record<EffectType, string> = {
  backdrop: "Word behind you",
  spotlight: "Spotlight",
  cutout: "Sticker cut-out",
  stamp: "Stamp",
  focus: "Focus brackets",
};
const CARD_LABEL: Record<Card["type"], string> = { point: "Key point card", list: "List card", stat: "Number card", cta: "Ending card" };
const NEEDS_OUTLINE = new Set<EffectType>(["backdrop", "spotlight", "cutout"]);

// Added by hand ("e:" effects, "c:" cards, "z" zoom); number cards need a number the creator said.
type AddType = `e:${EffectType}` | "c:point" | "c:list" | "c:cta" | "z";
const inSpan = (words: Word[], start: number, end: number) => words.filter((w) => w.end > start && w.start < end).map((w) => w.word);

function makeEffect(type: EffectType, span: Span, words: Word[], e?: Effect): Effect {
  const longest = inSpan(words, span.start, span.end)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .sort((a, b) => b.length - a.length)[0];
  const text = e && "text" in e ? e.text : (longest || "WOW").toUpperCase().slice(0, 16);
  if (type === "backdrop" || type === "stamp") return { type, text, ...span };
  if (type === "focus") return { type, label: e && "label" in e ? e.label : undefined, ...span };
  return { type, ...span };
}

function makeCard(type: "point" | "list" | "cta", span: Span, words: Word[]): Card {
  if (type === "point") return { type, text: inSpan(words, span.start, span.end).join(" ").slice(0, 60) || "Key point", ...span };
  if (type === "list") return { type, heading: "", items: ["", ""], ...span };
  return { type, text: "Follow for more", ...span };
}

// Review (before the first render) or fine-tune (after it) each zoom, card and effect of an edit.
export function EditMoments({ filmId, onRendering }: { filmId: string; onRendering: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [plan, setPlan] = useState<EditPlan | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [options, setOptions] = useState<Draft["options"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Caption words with their times; a line being typed is applied when its field loses focus.
  const [capWords, setCapWords] = useState<Word[]>([]);
  const [editing, setEditing] = useState<{ from: number; text: string } | null>(null);
  const [addType, setAddType] = useState<AddType>("z");
  const [addAt, setAddAt] = useState(-1);
  const [selected, setSelected] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  // Caption lines from the words as loaded, so a line doesn't regroup while it's being edited.
  const lines = useMemo(() => captionLines(capWords), [capWords]);

  useEffect(() => {
    fetch(`/api/edits/${filmId}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Couldn't load the edit");
        setDraft(d);
        setPlan(d.plan);
        setOptions(d.options);
        setCapWords(d.words);
      })
      .catch((e) => setError((e as Error).message));
  }, [filmId]);

  // Without a preview file a timer moves the playhead, so the timeline still plays.
  const hasVideo = Boolean(draft?.previewUrl);
  const length = draft?.durationSec ?? 0;
  useEffect(() => {
    if (hasVideo || !playing) return;
    const timer = setInterval(() => setTime((t) => (t + 0.1 >= length ? (setPlaying(false), length) : t + 0.1)), 100);
    return () => clearInterval(timer);
  }, [hasVideo, playing, length]);

  if (!draft || !plan || !options) return <p className="muted">{error ?? "Loading the effects…"}</p>;

  const duration = draft.durationSec;
  const editingLine = editing ? lines.find((l) => l.from === editing.from) : undefined;
  const words = editing && editingLine ? editLine(capWords, editingLine, editing.text) : capWords;
  const captionsChanged = words !== draft.words;
  const problems = conflicts(plan, off);
  const review = draft.status === "review";
  const canRender = review || (draft.rendersLeft ?? 0) > 0;
  const types = draft.available.faces ? (Object.keys(EFFECT_LABEL) as EffectType[]).filter((t) => draft.available.mask || !NEEDS_OUTLINE.has(t)) : [];
  const moments = [
    ...plan.effects.map((e, i) => ({ key: `e${i}`, kind: "effect" as MomentKind, i, start: e.start, end: e.end })),
    ...plan.cards.map((c, i) => ({ key: `c${i}`, kind: "card" as MomentKind, i, start: c.start, end: c.end })),
    ...plan.zooms.map((z, i) => ({ key: `z${i}`, kind: "zoom" as MomentKind, i, start: z.start, end: z.end })),
  ].sort((a, b) => a.start - b.start);
  const toggle = (key: string) => setOff((s) => (s.has(key) ? new Set([...s].filter((k) => k !== key)) : new Set([...s, key])));
  const setEffect = (i: number, e: Effect) => setPlan({ ...plan, effects: plan.effects.map((x, j) => (j === i ? e : x)) });
  const setCard = (i: number, c: Card) => setPlan({ ...plan, cards: plan.cards.map((x, j) => (j === i ? c : x)) });
  const setSpan = (key: string, i: number, span: Span) => {
    if (key[0] === "e") setEffect(i, { ...plan.effects[i], ...span });
    else if (key[0] === "c") setCard(i, { ...plan.cards[i], ...span });
    else setPlan({ ...plan, zooms: plan.zooms.map((z, j) => (j === i ? span : z)) });
  };
  const addKind: MomentKind = addType === "z" ? "zoom" : addType.startsWith("e:") ? "effect" : "card";
  const addFull = moments.filter((m) => m.kind === addKind && !off.has(m.key)).length >= MAX_COUNT[addKind];
  const when = lines.length ? lines.map((l) => ({ at: l.start, label: `${formatTime(l.start)} “${l.text.split(" ").slice(0, 5).join(" ")}…”` })) : [{ at: 0, label: "0:00.0" }];
  const seek = (t: number) => {
    setTime(t);
    if (video.current) video.current.currentTime = t;
  };
  const play = () => {
    const v = video.current;
    if (v) {
      if (v.paused) {
        if (v.currentTime >= duration - 0.05) v.currentTime = 0;
        v.play().catch(() => {});
      } else v.pause();
    } else {
      if (!playing && time >= duration) setTime(0);
      setPlaying(!playing);
    }
  };
  const select = (key: string) => {
    setSelected(key);
    const m = moments.find((x) => x.key === key);
    if (m) seek(m.start);
    else if (key[0] === "w") seek(capWords[Number(key.slice(1))]?.start ?? time);
  };
  const wordIndex = selected?.[0] === "w" ? Number(selected.slice(1)) : -1;
  const word = wordIndex >= 0 ? capWords[wordIndex] : undefined;
  const retime = (i: number, origin: Span, mode: "move" | "start" | "end", delta: number) => {
    const next = dragWord(capWords, i, origin, mode, delta, duration);
    setCapWords(next);
    seek(mode === "end" ? next[i].end : next[i].start);
  };
  const labelOf = (m: (typeof moments)[number]) => (m.kind === "effect" ? EFFECT_LABEL[plan.effects[m.i].type] : m.kind === "card" ? CARD_LABEL[plan.cards[m.i].type] : "Zoom in");
  const index = moments.findIndex((m) => m.key === selected);
  const add = () => {
    const span = newSpan(addKind, addAt < 0 ? time : addAt, duration);
    const key = addType === "z" ? `z${plan.zooms.length}` : addType.startsWith("e:") ? `e${plan.effects.length}` : `c${plan.cards.length}`;
    if (addType === "z") setPlan({ ...plan, zooms: [...plan.zooms, span] });
    else if (addType.startsWith("e:")) setPlan({ ...plan, effects: [...plan.effects, makeEffect(addType.slice(2) as EffectType, span, words)] });
    else setPlan({ ...plan, cards: [...plan.cards, makeCard(addType.slice(2) as "point" | "list" | "cta", span, words)] });
    setSelected(key);
    seek(span.start);
  };

  async function render() {
    setBusy(true);
    setError(null);
    const kept: EditPlan = {
      ...plan!,
      effects: plan!.effects.filter((_, i) => !off.has(`e${i}`)),
      cards: plan!.cards.filter((_, i) => !off.has(`c${i}`)).map((c) => (c.type === "list" ? { ...c, items: c.items.filter((x) => x.trim()) } : c)),
      zooms: plan!.zooms.filter((_, i) => !off.has(`z${i}`)),
    };
    const body = { plan: kept, ...options, ...(captionsChanged ? { words } : {}) };
    const res = await fetch(`/api/edits/${filmId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const reply = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(reply.error ?? "Couldn't render the video");
    onRendering();
  }

  return (
    <div className="panel">
      <strong>{review ? "Check your effects" : "Fine-tune"}</strong>
      <p className="muted">Move, stretch, swap or add moments, and fix your captions.</p>
      {!draft.available.faces && <p className="muted">We couldn&apos;t find your face in this video, so effects around you are off.</p>}
      <EditPreview
        src={draft.previewUrl}
        videoRef={video}
        time={time}
        plan={plan}
        off={off}
        words={words}
        lines={lines}
        faces={draft.faces}
        captions={options.captions}
        onTime={setTime}
        onPlaying={setPlaying}
      />
      <div className="actions" style={{ justifyContent: "center" }}>
        <button type="button" className="secondary" onClick={play}>{playing ? "Pause" : "Play"}</button>
        <span className="muted">
          {formatTime(time)} / {formatTime(duration)}
        </span>
      </div>
      <p className="muted" style={{ textAlign: "center" }}>A rough preview: in the final video, words and effects sit around you.</p>
      <EditTimeline
        duration={duration}
        moments={moments.map((m) => ({ key: m.key, kind: m.kind, label: labelOf(m), start: m.start, end: m.end, off: off.has(m.key), problem: problems.get(m.key) }))}
        lines={lines}
        words={capWords}
        onWordDrag={retime}
        snaps={snapPoints(words)}
        time={time}
        selected={selected}
        onSelect={select}
        onSeek={seek}
        onChange={(key, span, mode) => {
          const m = moments.find((x) => x.key === key);
          if (!m) return;
          setSpan(key, m.i, span);
          seek(mode === "end" ? span.end : span.start);
        }}
      />
      <p className="muted">Drag a block to move it, or drag its edges to stretch it. Click the ruler to move the playhead.</p>
      {word && (
        <fieldset>
          <strong>Caption word “{word.word}”</strong>{" "}
          <span className="muted">
            {formatTime(word.start)}–{formatTime(word.end)}
          </span>
          <div className="actions">
            <button type="button" className="secondary" onClick={() => retime(wordIndex, word, "move", -WORD_STEP)}>Earlier</button>
            <button type="button" className="secondary" onClick={() => retime(wordIndex, word, "move", WORD_STEP)}>Later</button>
            <span className="muted">Lasts {(word.end - word.start).toFixed(2)} s</span>
            <button type="button" className="secondary" onClick={() => retime(wordIndex, word, "end", -WORD_STEP)}>Shorter</button>
            <button type="button" className="secondary" onClick={() => retime(wordIndex, word, "end", WORD_STEP)}>Longer</button>
          </div>
          <div className="actions">
            <button type="button" className="secondary" disabled={wordIndex <= 0} onClick={() => select(`w${wordIndex - 1}`)}>Previous word</button>
            <button type="button" className="secondary" disabled={wordIndex >= capWords.length - 1} onClick={() => select(`w${wordIndex + 1}`)}>Next word</button>
            <button type="button" className="secondary" onClick={() => setSelected(null)}>Show all moments</button>
          </div>
        </fieldset>
      )}
      {selected && !word && (
        <div className="actions">
          <button type="button" className="secondary" disabled={index <= 0} onClick={() => select(moments[index - 1].key)}>Previous</button>
          <button type="button" className="secondary" disabled={index >= moments.length - 1} onClick={() => select(moments[index + 1].key)}>Next</button>
          <button type="button" className="secondary" onClick={() => setSelected(null)}>Show all moments</button>
        </div>
      )}
      {moments.filter((m) => !selected || (!word && m.key === selected)).map((m) => {
        const kind = m.key[0];
        const isOff = off.has(m.key);
        const effect = kind === "e" ? plan.effects[m.i] : null;
        const card = kind === "c" ? plan.cards[m.i] : null;
        const quote = inSpan(words, m.start, m.end).join(" ");
        const problem = problems.get(m.key);
        return (
          <fieldset key={m.key} style={{ opacity: isOff ? 0.55 : 1 }}>
            <label className="check">
              <input type="checkbox" checked={!isOff} onChange={() => toggle(m.key)} />{" "}
              <strong>{effect ? EFFECT_LABEL[effect.type] : card ? CARD_LABEL[card.type] : "Zoom in"}</strong>{" "}
              <span className="muted">
                {formatTime(m.start)}–{formatTime(m.end)}
                {quote ? ` · “${quote}”` : ""}
              </span>
            </label>
            {!isOff && (
              <div className="actions">
                <span className="muted">Starts</span>
                <button type="button" className="secondary" onClick={() => setSpan(m.key, m.i, moveSpan(m, -STEP, duration))}>Earlier</button>
                <button type="button" className="secondary" onClick={() => setSpan(m.key, m.i, moveSpan(m, STEP, duration))}>Later</button>
                <span className="muted">Lasts {(m.end - m.start).toFixed(2)} s</span>
                <button type="button" className="secondary" onClick={() => setSpan(m.key, m.i, resizeSpan(m, -STEP, m.kind, duration))}>Shorter</button>
                <button type="button" className="secondary" onClick={() => setSpan(m.key, m.i, resizeSpan(m, STEP, m.kind, duration))}>Longer</button>
              </div>
            )}
            {!isOff && problem && <p className="error">{problem}</p>}
            {!isOff && effect && (
              <>
                <select value={effect.type} onChange={(e) => setEffect(m.i, makeEffect(e.target.value as EffectType, m, words, effect))}>
                  {types.map((t) => (
                    <option key={t} value={t}>{EFFECT_LABEL[t]}</option>
                  ))}
                </select>
                {(effect.type === "backdrop" || effect.type === "stamp") && (
                  <input value={effect.text} maxLength={16} onChange={(e) => setEffect(m.i, { ...effect, text: e.target.value })} />
                )}
                {effect.type === "focus" && (
                  <input placeholder="Label (optional)" value={effect.label ?? ""} maxLength={24} onChange={(e) => setEffect(m.i, { ...effect, label: e.target.value || undefined })} />
                )}
              </>
            )}
            {!isOff && card && (card.type === "point" || card.type === "cta") && (
              <input value={card.text} maxLength={card.type === "point" ? 60 : 50} onChange={(e) => setCard(m.i, { ...card, text: e.target.value })} />
            )}
            {!isOff && card?.type === "stat" && <input value={card.label} maxLength={50} onChange={(e) => setCard(m.i, { ...card, label: e.target.value })} />}
            {!isOff && card?.type === "list" && (
              <>
                <input value={card.heading} maxLength={40} onChange={(e) => setCard(m.i, { ...card, heading: e.target.value })} />
                {card.items.map((item, j) => (
                  <input key={j} value={item} maxLength={40} onChange={(e) => setCard(m.i, { ...card, items: card.items.map((x, k) => (k === j ? e.target.value : x)) })} />
                ))}
              </>
            )}
          </fieldset>
        );
      })}
      <fieldset>
        <strong>Add a moment</strong>
        <select value={addType} onChange={(e) => setAddType(e.target.value as AddType)}>
          {types.map((t) => (
            <option key={t} value={`e:${t}`}>{EFFECT_LABEL[t]}</option>
          ))}
          <option value="c:point">{CARD_LABEL.point}</option>
          <option value="c:list">{CARD_LABEL.list}</option>
          <option value="c:cta">{CARD_LABEL.cta}</option>
          <option value="z">Zoom in</option>
        </select>
        <select value={addAt} onChange={(e) => setAddAt(Number(e.target.value))}>
          <option value={-1}>At the playhead · {formatTime(time)}</option>
          {when.map((w) => (
            <option key={w.at} value={w.at}>{w.label}</option>
          ))}
        </select>
        <button type="button" className="secondary" disabled={addFull} onClick={add}>
          {addFull ? `${MAX_COUNT[addKind]} is the most for this kind` : "Add"}
        </button>
      </fieldset>
      <label className="check">
        <input type="checkbox" checked={options.captions} onChange={(e) => setOptions({ ...options, captions: e.target.checked })} /> Captions
      </label>
      <label className="check">
        <input type="checkbox" checked={options.sounds} onChange={(e) => setOptions({ ...options, sounds: e.target.checked })} /> Sound effects
      </label>
      <select value={options.voice} onChange={(e) => setOptions({ ...options, voice: e.target.value })}>
        <option value="natural">Voice as recorded</option>
        <option value="clear">Clear voice</option>
        <option value="deeper">Deeper voice</option>
      </select>
      {options.captions && lines.length > 0 && (
        <fieldset>
          <strong>Caption words</strong>
          <p className="muted">Fix any word we heard wrong. Clear a line to hide it. To change when words show, zoom into the timeline.</p>
          {lines.map((l) => (
            <label key={l.from}>
              <span className="muted">{formatTime(l.start)}</span>
              <input
                value={editing?.from === l.from ? editing.text : l.text}
                onChange={(e) => setEditing({ from: l.from, text: e.target.value })}
                onBlur={() => {
                  if (editing?.from !== l.from) return;
                  setCapWords(editLine(capWords, l, editing.text));
                  setEditing(null);
                }}
              />
            </label>
          ))}
        </fieldset>
      )}
      {error && <p>{error}</p>}
      {problems.size > 0 && <p className="muted">Fix the moments marked in red, or turn them off.</p>}
      <button type="button" disabled={busy || !canRender || problems.size > 0} onClick={render}>
        {review ? "Render my video" : canRender ? `Render again · ${draft.rendersLeft} free left` : "No free re-renders left"}
      </button>
    </div>
  );
}
