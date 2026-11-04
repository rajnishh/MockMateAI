"use client";

import { useState } from "react";

// Crop, fade and speed for a finished song. Free; saves a new copy.
export function SongEditor({ songId, durationSec, onDone }: { songId: string; durationSec: number; onDone: () => void }) {
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(durationSec);
  const [fadeInSec, setFadeInSec] = useState(0);
  const [fadeOutSec, setFadeOutSec] = useState(3);
  const [speed, setSpeed] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/songs/${songId}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startSec, endSec: endSec < durationSec ? endSec : undefined, fadeInSec, fadeOutSec, speed }),
    });
    setSaving(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Couldn't edit the song");
    onDone();
  }

  const num = (set: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => set(Number(e.target.value));
  return (
    <div className="panel">
      <div className="row">
        <div>
          <label htmlFor={`start-${songId}`}>Start (s)</label>
          <input id={`start-${songId}`} type="number" min={0} max={durationSec} step={0.5} value={startSec} onChange={num(setStartSec)} />
        </div>
        <div>
          <label htmlFor={`end-${songId}`}>End (s)</label>
          <input id={`end-${songId}`} type="number" min={1} max={durationSec} step={0.5} value={endSec} onChange={num(setEndSec)} />
        </div>
        <div>
          <label htmlFor={`speed-${songId}`}>Speed</label>
          <select id={`speed-${songId}`} value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {[0.8, 0.9, 1, 1.1, 1.25].map((s) => <option key={s} value={s}>{s === 1 ? "Normal" : `${s}×`}</option>)}
          </select>
        </div>
      </div>
      <div className="row">
        <div>
          <label htmlFor={`fin-${songId}`}>Fade in (s)</label>
          <input id={`fin-${songId}`} type="number" min={0} max={10} step={0.5} value={fadeInSec} onChange={num(setFadeInSec)} />
        </div>
        <div>
          <label htmlFor={`fout-${songId}`}>Fade out (s)</label>
          <input id={`fout-${songId}`} type="number" min={0} max={10} step={0.5} value={fadeOutSec} onChange={num(setFadeOutSec)} />
        </div>
      </div>
      <button type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save as new copy · free"}</button>
      {error && <span className="muted">{error}</span>}
    </div>
  );
}
