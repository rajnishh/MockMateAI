"use client";

import { useEffect, useState } from "react";
import type { Card, EditPlan, Effect } from "@/lib/edit/plan";

type EffectType = Effect["type"];
type Word = { word: string; start: number; end: number };
type Draft = {
  status: string;
  plan: EditPlan;
  words: Word[];
  options: { captions: boolean; sounds: boolean; voice: string };
  available: { faces: boolean; mask: boolean };
  rendersLeft: number | null;
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

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const inSpan = (words: Word[], start: number, end: number) => words.filter((w) => w.end > start && w.start < end).map((w) => w.word);

function swapEffect(e: Effect, type: EffectType, words: Word[]): Effect {
  const span = { start: e.start, end: e.end };
  const longest = inSpan(words, e.start, e.end)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .sort((a, b) => b.length - a.length)[0];
  const text = "text" in e ? e.text : (longest || "WOW").toUpperCase().slice(0, 16);
  if (type === "backdrop" || type === "stamp") return { type, text, ...span };
  if (type === "focus") return { type, label: "label" in e ? e.label : undefined, ...span };
  return { type, ...span };
}

// Review (before the first render) or fine-tune (after it) each zoom, card and effect of an edit.
export function EditMoments({ filmId, onRendering }: { filmId: string; onRendering: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [plan, setPlan] = useState<EditPlan | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [options, setOptions] = useState<Draft["options"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/edits/${filmId}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Couldn't load the edit");
        setDraft(d);
        setPlan(d.plan);
        setOptions(d.options);
      })
      .catch((e) => setError((e as Error).message));
  }, [filmId]);

  if (!draft || !plan || !options) return <p className="muted">{error ?? "Loading the effects…"}</p>;

  const review = draft.status === "review";
  const canRender = review || (draft.rendersLeft ?? 0) > 0;
  const types = (Object.keys(EFFECT_LABEL) as EffectType[]).filter((t) => draft.available.mask || !NEEDS_OUTLINE.has(t));
  const moments = [
    ...plan.effects.map((e, i) => ({ key: `e${i}`, i, start: e.start, end: e.end })),
    ...plan.cards.map((c, i) => ({ key: `c${i}`, i, start: c.start, end: c.end })),
    ...plan.zooms.map((z, i) => ({ key: `z${i}`, i, start: z.start, end: z.end })),
  ].sort((a, b) => a.start - b.start);
  const toggle = (key: string) => setOff((s) => (s.has(key) ? new Set([...s].filter((k) => k !== key)) : new Set([...s, key])));
  const setEffect = (i: number, e: Effect) => setPlan({ ...plan, effects: plan.effects.map((x, j) => (j === i ? e : x)) });
  const setCard = (i: number, c: Card) => setPlan({ ...plan, cards: plan.cards.map((x, j) => (j === i ? c : x)) });

  async function render() {
    setBusy(true);
    setError(null);
    const kept: EditPlan = {
      ...plan!,
      effects: plan!.effects.filter((_, i) => !off.has(`e${i}`)),
      cards: plan!.cards.filter((_, i) => !off.has(`c${i}`)).map((c) => (c.type === "list" ? { ...c, items: c.items.filter((x) => x.trim()) } : c)),
      zooms: plan!.zooms.filter((_, i) => !off.has(`z${i}`)),
    };
    const res = await fetch(`/api/edits/${filmId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: kept, ...options }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Couldn't render the video");
    onRendering();
  }

  return (
    <div className="panel">
      <strong>{review ? "Check your effects" : "Fine-tune"}</strong>
      <p className="muted">Turn moments off, swap effects or fix the words.</p>
      {!draft.available.faces && <p className="muted">We couldn&apos;t find your face in this video, so effects around you are off.</p>}
      {moments.map((m) => {
        const kind = m.key[0];
        const isOff = off.has(m.key);
        const effect = kind === "e" ? plan.effects[m.i] : null;
        const card = kind === "c" ? plan.cards[m.i] : null;
        const quote = inSpan(draft.words, m.start, m.end).join(" ");
        return (
          <fieldset key={m.key} style={{ opacity: isOff ? 0.55 : 1 }}>
            <label className="check">
              <input type="checkbox" checked={!isOff} onChange={() => toggle(m.key)} />{" "}
              <strong>{effect ? EFFECT_LABEL[effect.type] : card ? CARD_LABEL[card.type] : "Zoom in"}</strong>{" "}
              <span className="muted">
                {clock(m.start)}–{clock(m.end)}
                {quote ? ` · “${quote}”` : ""}
              </span>
            </label>
            {!isOff && effect && (
              <>
                <select value={effect.type} onChange={(e) => setEffect(m.i, swapEffect(effect, e.target.value as EffectType, draft.words))}>
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
      {error && <p>{error}</p>}
      <button type="button" disabled={busy || !canRender} onClick={render}>
        {review ? "Render my video" : canRender ? `Render again · ${draft.rendersLeft} free left` : "No free re-renders left"}
      </button>
    </div>
  );
}
