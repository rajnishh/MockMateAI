"use client";

import { type CSSProperties, type FormEvent, useEffect, useState } from "react";
import { type AiProvider, type EngineStatus, type EngineView, type EnginesView, MAX_ENGINES, needsKey } from "@/lib/agent/ai-choice";

const OTHER = "__other";

// "Resting until 5:30 AM", in the viewer's own time; "tomorrow" when it isn't today.
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
  if (off) return <span className="pill" style={{ background: "var(--surface-sunken)", color: "var(--ink-muted)" }}>Off</span>;
  if (status === "resting") return <span className="pill" style={{ background: "var(--surface-sunken)", color: "var(--warning)" }}>{restingText(restUntil)}</span>;
  if (status === "key") return <span className="pill pill-failed">Key not working</span>;
  return <span className="pill">Ready</span>;
}

async function send(url: string, method: string, body?: unknown): Promise<EnginesView> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as EnginesView;
}

const modelLabel = (providers: AiProvider[], e: EngineView) => providers.find((p) => p.id === e.provider)?.models.find((m) => m.id === e.model)?.label ?? e.model;

const rowStyle: CSSProperties = { display: "grid", gap: 10, padding: "12px 14px", background: "var(--surface-raised)", border: "1px solid var(--line)", borderRadius: 14 };
const rankStyle = (reelkar?: boolean): CSSProperties => ({
  flex: "none",
  width: 28,
  height: 28,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  fontSize: 13,
  fontWeight: 800,
  background: reelkar ? "var(--teal-tint)" : "var(--surface-sunken)",
  color: reelkar ? "var(--teal-text)" : "var(--ink)",
});

// Add an engine, or change one's model, key or extra value. Both are checked on the server first.
function EngineForm({ providers, engine, onDone, onCancel }: { providers: AiProvider[]; engine?: EngineView; onDone: (v: EnginesView) => void; onCancel: () => void }) {
  const [providerId, setProviderId] = useState<string>(engine?.provider ?? providers[0]?.id ?? "");
  const p = providers.find((x) => x.id === providerId);
  const listed = (pr: AiProvider | undefined, id: string) => !!pr?.models.some((m) => m.id === id);
  const [model, setModel] = useState(() => (engine ? (listed(p, engine.model) ? engine.model : OTHER) : (p?.models[0]?.id ?? (p?.anyModel ? OTHER : ""))));
  const [custom, setCustom] = useState(engine && !listed(p, engine.model) ? engine.model : "");
  const [key, setKey] = useState("");
  const [extra, setExtra] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idp = engine ? `ai-${engine.id}` : "ai-new";

  function pick(id: string) {
    const next = providers.find((x) => x.id === id);
    setProviderId(id);
    setModel(next?.models[0]?.id ?? (next?.anyModel ? OTHER : ""));
    setCustom("");
    setKey("");
    setExtra("");
    setError(null);
  }

  if (!p) return <p className="error">This AI isn&apos;t offered on this server any more. You can remove it.</p>;
  const keyNeeded = needsKey(p);
  const chosenModel = model === OTHER ? custom.trim() : model;
  const ready = engine
    ? (!!chosenModel && chosenModel !== engine.model) || !!key.trim() || !!extra.trim()
    : (!keyNeeded || !!key.trim()) && (!p.extra || !!extra.trim()) && (model !== OTHER || !!custom.trim());

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!p) return;
    setSaving(true);
    setError(null);
    try {
      const v = engine
        ? await send(`/api/ai/engines/${engine.id}`, "PATCH", {
            model: chosenModel && chosenModel !== engine.model ? chosenModel : undefined,
            key: key.trim() || undefined,
            extra: extra.trim() || undefined,
          })
        : await send("/api/ai/engines", "POST", { provider: p.id, model: chosenModel || undefined, key: key.trim() || undefined, extra: extra.trim() || undefined });
      onDone(v);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} aria-busy={saving}>
      {!engine && (
        <>
          <label htmlFor={`${idp}-provider`}>Which AI</label>
          <select id={`${idp}-provider`} value={p.id} onChange={(e) => pick(e.target.value)}>
            {providers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <span className="muted" style={{ display: "block", marginTop: 6 }}>
            {p.price}
            {!p.chat && ". Not used for chat."}
          </span>
        </>
      )}

      {(p.models.length > 0 || p.anyModel) && (
        <>
          <label htmlFor={`${idp}-model`}>Model</label>
          <select id={`${idp}-model`} value={model} onChange={(e) => setModel(e.target.value)}>
            {p.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
            {p.anyModel && <option value={OTHER}>Another model…</option>}
          </select>
          {model === OTHER && (
            <>
              <label htmlFor={`${idp}-custom`}>Model id</label>
              <input id={`${idp}-custom`} value={custom} maxLength={120} autoComplete="off" placeholder={p.models[0]?.id ?? "Model id"} onChange={(e) => setCustom(e.target.value)} />
            </>
          )}
        </>
      )}

      {keyNeeded && (
        <>
          <label htmlFor={`${idp}-key`}>{engine ? `New ${p.name} key (optional)` : `Your ${p.name} key`}</label>
          <input
            id={`${idp}-key`}
            type="password"
            autoComplete="off"
            value={key}
            maxLength={300}
            placeholder={engine?.keyHint ? `Saved (${engine.keyHint}). Paste a new one to replace it.` : "Paste your key"}
            onChange={(e) => setKey(e.target.value)}
          />
          {p.keyUrl && (
            <span className="muted" style={{ display: "block", marginTop: 6 }}>
              <a href={p.keyUrl} target="_blank" rel="noreferrer">
                Get a free key
              </a>
            </span>
          )}
        </>
      )}

      {p.extra && (
        <>
          <label htmlFor={`${idp}-extra`}>{engine ? `${p.extra.label} (optional)` : p.extra.label}</label>
          <input
            id={`${idp}-extra`}
            value={extra}
            maxLength={120}
            autoComplete="off"
            placeholder={engine ? "Saved. Type a new one to change it." : p.extra.placeholder}
            onChange={(e) => setExtra(e.target.value)}
          />
        </>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" disabled={saving || !ready}>
          {saving ? (keyNeeded ? "Checking your key…" : "Checking…") : engine ? "Check and save" : "Check and connect"}
        </button>
        <button type="button" className="secondary" disabled={saving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// "Your AI engines": the AI services every AI task tries in order, ending with Reelkar free.
export function AiPicker() {
  const [view, setView] = useState<EnginesView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  function load() {
    fetch("/api/ai/engines")
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error ?? `Couldn't load your AI engines (${r.status})`);
        setView(data as EnginesView);
      })
      .catch((err) => setLoadError((err as Error).message));
  }
  useEffect(load, []);

  async function run(id: string, action: () => Promise<EnginesView>) {
    setBusy(id);
    setError(null);
    try {
      setView(await action());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!view) {
    return (
      <fieldset className="modes ai-picker">
        <legend>Your AI engines</legend>
        {loadError ? (
          <div className="ai-current">
            <span className="error" role="alert">
              {loadError}
            </span>
            <button type="button" className="secondary small" onClick={() => (setLoadError(null), load())}>
              Try again
            </button>
          </div>
        ) : (
          <span className="muted">Loading your AI engines…</span>
        )}
      </fieldset>
    );
  }

  // Without safe key storage on the server, only engines that need no key can be used.
  const providers = view.ownKeys ? view.providers : view.providers.filter((p) => !needsKey(p));
  const shown = view.ownKeys ? view.engines : view.engines.filter((e) => e.provider === "ollama");
  const full = view.engines.length >= MAX_ENGINES;
  const on = shown.filter((e) => e.enabled).map((e) => e.name);
  const summary = on.length ? `${on.join(" → ")} → Reelkar free` : "Reelkar free";

  function move(e: EngineView, by: -1 | 1) {
    const other = shown[shown.indexOf(e) + by];
    if (!other || !view) return;
    const ids = view.engines.map((x) => x.id);
    const i = ids.indexOf(e.id);
    const j = ids.indexOf(other.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(e.id, () => send("/api/ai/engines/order", "PUT", { ids }));
  }

  return (
    <fieldset className="modes ai-picker">
      <legend>Your AI engines</legend>
      <div className="ai-current">
        <span>
          <strong>{summary}</strong>
          {view.reelkar.status === "resting" && !on.length ? <span className="muted"> · {restingText(view.reelkar.restUntil)}</span> : null}
        </span>
        <button type="button" className="secondary small" aria-expanded={open} aria-controls="ai-engines" onClick={() => setOpen(!open)}>
          {open ? "Close" : "Manage"}
        </button>
      </div>

      {open && (
        <div id="ai-engines" style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <p className="muted" style={{ margin: 0 }}>
            Connect free AI services with your own keys. Reelkar tries them top to bottom and switches to the next one when one runs out. Reelkar free is always there as the last one.
            They&apos;re used for chat, lyrics, song checks, ideas, captions and reel scripts.
          </p>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Keys are stored encrypted. Only the last 4 characters are ever shown.
          </p>
          {!view.ownKeys && (
            <p className="muted" style={{ margin: 0, padding: "10px 12px", borderRadius: 12, background: "var(--surface-sunken)", color: "var(--ink)" }}>
              {providers.length
                ? "Using your own keys isn't available on this server yet. You can still use the engines below that need no key."
                : "Using your own keys isn't available on this server yet, so Reelkar free answers everything for now."}
            </p>
          )}
          {error && (
            <p className="error" role="alert" style={{ margin: 0 }}>
              {error}
            </p>
          )}

          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }} aria-label="Engines, in the order they're tried">
            {shown.map((e, i) => {
              const details = [modelLabel(view.providers, e), e.keyHint ? `key ${e.keyHint}` : null].filter(Boolean).join(" · ");
              const locked = busy !== null;
              return (
                <li key={e.id} style={rowStyle}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <span style={rankStyle()} aria-hidden="true">
                      {i + 1}
                    </span>
                    <div className="grow" style={{ opacity: e.enabled ? 1 : 0.6 }}>
                      <strong>{e.name}</strong>
                      {details && <span className="muted">{details}</span>}
                      <StatusPill status={e.status} restUntil={e.restUntil} off={!e.enabled} />
                      {!e.chat && <span className="muted" style={{ fontSize: 13 }}>Not used for chat</span>}
                    </div>
                    <label className="check" style={{ margin: 0, fontSize: 14 }}>
                      <input
                        type="checkbox"
                        role="switch"
                        checked={e.enabled}
                        disabled={locked}
                        aria-label={`Use ${e.name}`}
                        onChange={(ev) => run(e.id, () => send(`/api/ai/engines/${e.id}`, "PATCH", { enabled: ev.target.checked }))}
                      />
                      {e.enabled ? "On" : "Off"}
                    </label>
                  </div>

                  {editing === e.id ? (
                    <EngineForm
                      providers={view.providers}
                      engine={e}
                      onDone={(v) => {
                        setView(v);
                        setEditing(null);
                      }}
                      onCancel={() => setEditing(null)}
                    />
                  ) : confirming === e.id ? (
                    <div className="confirm" role="alertdialog" aria-label={`Remove ${e.name}?`}>
                      <span>Remove {e.name}? Its key is deleted from Reelkar. You can add it again any time.</span>
                      <div className="confirm-actions">
                        <button
                          type="button"
                          className="danger-solid small"
                          disabled={locked}
                          onClick={() => {
                            setConfirming(null);
                            run(e.id, () => send(`/api/ai/engines/${e.id}`, "DELETE"));
                          }}
                        >
                          Remove
                        </button>
                        <button type="button" className="secondary small" onClick={() => setConfirming(null)}>
                          Keep it
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingLeft: 40 }}>
                      <button type="button" className="ghost small" disabled={locked || i === 0} aria-label={`Move ${e.name} up`} onClick={() => move(e, -1)}>
                        ↑ Up
                      </button>
                      <button type="button" className="ghost small" disabled={locked || i === shown.length - 1} aria-label={`Move ${e.name} down`} onClick={() => move(e, 1)}>
                        ↓ Down
                      </button>
                      <button
                        type="button"
                        className="ghost small"
                        disabled={locked}
                        aria-label={`Change ${e.name}`}
                        onClick={() => {
                          setAdding(false);
                          setConfirming(null);
                          setEditing(e.id);
                        }}
                      >
                        Change
                      </button>
                      <button type="button" className="ghost danger small" disabled={locked} aria-label={`Remove ${e.name}`} onClick={() => setConfirming(e.id)}>
                        Remove
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
            <li style={rowStyle}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={rankStyle(true)} aria-hidden="true">
                  ✦
                </span>
                <div className="grow">
                  <strong>Reelkar free · always on</strong>
                  <span className="muted">{shown.length ? "Used when none of yours can answer" : "Answers everything until you connect your own"}</span>
                  <StatusPill status={view.reelkar.status === "resting" ? "resting" : "ready"} restUntil={view.reelkar.restUntil} />
                </div>
              </div>
            </li>
          </ol>

          {shown.length === 0 && providers.length > 0 && !adding && (
            <span className="muted">No engines of your own yet. Add one to get more free AI each day.</span>
          )}

          {providers.length > 0 &&
            (adding ? (
              <div style={rowStyle}>
                <strong>Add an engine</strong>
                <EngineForm
                  providers={providers}
                  onDone={(v) => {
                    setView(v);
                    setAdding(false);
                  }}
                  onCancel={() => setAdding(false)}
                />
              </div>
            ) : full ? (
              <span className="muted">You&apos;ve connected {MAX_ENGINES} engines, the most you can. Remove one to add another.</span>
            ) : (
              <button
                type="button"
                className="secondary"
                disabled={busy !== null}
                onClick={() => {
                  setEditing(null);
                  setConfirming(null);
                  setAdding(true);
                }}
              >
                + Add an engine
              </button>
            ))}
        </div>
      )}
    </fieldset>
  );
}
