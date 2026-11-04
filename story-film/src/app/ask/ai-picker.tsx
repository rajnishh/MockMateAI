"use client";

import { type FormEvent, useEffect, useState } from "react";
import { type AiChoiceView, needsKey } from "@/lib/agent/ai-choice";

const OTHER = "__other";

// Which AI answers in Ask Reelkar: Reelkar free, or one the creator brings their own key for.
export function AiPicker() {
  const [view, setView] = useState<AiChoiceView | null>(null);
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState("reelkar");
  const [model, setModel] = useState("");
  const [custom, setCustom] = useState("");
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function reset(v: AiChoiceView) {
    setView(v);
    setProvider(v.provider);
    const p = v.providers.find((x) => x.id === v.provider);
    const listed = p?.models.some((m) => m.id === v.model);
    setModel(listed || !v.model ? (v.model ?? p?.models[0]?.id ?? "") : OTHER);
    setCustom(listed ? "" : (v.model ?? ""));
    setKey("");
  }

  useEffect(() => {
    fetch("/api/agent/ai")
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => v && reset(v))
      .catch(() => undefined);
  }, []);

  if (!view) return null;
  const current = view.providers.find((p) => p.id === view.provider);
  const chosen = view.providers.find((p) => p.id === provider) ?? view.providers[0];
  const keySaved = view.provider === chosen.id && !!view.keyHint;

  function pick(id: string) {
    setProvider(id);
    const p = view!.providers.find((x) => x.id === id);
    const savedModel = id === view!.provider ? view!.model : null;
    const listed = !!savedModel && !!p?.models.some((m) => m.id === savedModel);
    setModel(savedModel && !listed ? OTHER : (savedModel ?? p?.models[0]?.id ?? ""));
    setCustom(savedModel && !listed ? savedModel : "");
    setKey("");
    setError(null);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/agent/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: chosen.id, model: model === OTHER ? custom : model, key: key || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      reset(data);
      setSaved(true);
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const modelLabel = current?.models.find((m) => m.id === view.model)?.label ?? view.model;

  return (
    <fieldset className="modes ai-picker">
      <legend>Who answers you</legend>
      <div className="ai-current">
        <span>
          <strong>{current?.name ?? "Reelkar free"}</strong>
          {view.provider !== "reelkar" && modelLabel ? <span className="muted"> · {modelLabel}</span> : null}
          {view.keyHint ? <span className="muted"> · key {view.keyHint}</span> : null}
        </span>
        <button type="button" className="secondary" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Close" : "Change"}
        </button>
      </div>
      {saved && !open && <span className="muted">Saved and checked. Your next message uses it.</span>}

      {open && (
        <form onSubmit={save}>
          <label htmlFor="ai-provider">AI</label>
          <select id="ai-provider" value={chosen.id} onChange={(e) => pick(e.target.value)}>
            {view.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="muted">{chosen.price}</span>

          {chosen.models.length > 0 && (
            <>
              <label htmlFor="ai-model">Model</label>
              <select id="ai-model" value={model} onChange={(e) => setModel(e.target.value)}>
                {chosen.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
                {chosen.anyModel && <option value={OTHER}>Another model…</option>}
              </select>
              {model === OTHER && (
                <>
                  <label htmlFor="ai-custom">Model id</label>
                  <input id="ai-custom" value={custom} maxLength={120} placeholder={chosen.models[0]?.id} onChange={(e) => setCustom(e.target.value)} />
                </>
              )}
            </>
          )}

          {needsKey(chosen) && (
            <>
              <label htmlFor="ai-key">Your {chosen.name} key</label>
              <input
                id="ai-key"
                type="password"
                autoComplete="off"
                value={key}
                maxLength={300}
                placeholder={keySaved ? `Saved (${view.keyHint}). Paste a new one to replace it.` : "Paste your key"}
                onChange={(e) => setKey(e.target.value)}
              />
              <span className="muted">
                Stored encrypted and never shown again.{" "}
                {chosen.keyUrl && (
                  <a href={chosen.keyUrl} target="_blank" rel="noreferrer">
                    Get a key
                  </a>
                )}
              </span>
            </>
          )}
          {chosen.id !== "reelkar" && <p className="muted">If it stops working (a wrong key or a used-up limit), Reelkar free answers and tells you why. Reels are still made the usual way.</p>}

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={saving || (needsKey(chosen) && !key && !keySaved) || (model === OTHER && !custom.trim())}>
            {saving ? "Checking…" : chosen.id === "reelkar" ? "Use Reelkar free" : "Check and save"}
          </button>
        </form>
      )}
      {!view.ownKeys && <span className="muted">Using your own AI key needs TOKEN_ENCRYPTION_KEY set on the server.</span>}
    </fieldset>
  );
}
