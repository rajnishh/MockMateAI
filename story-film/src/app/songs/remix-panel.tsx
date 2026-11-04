"use client";

import { useState } from "react";

type Kind = "cover" | "extend" | "replace";
export type RemixPrices = Record<Kind, number>;

const KINDS: [Kind, string, string][] = [
  ["cover", "🎨 Cover", "Sing it again in another style."],
  ["extend", "➕ Extend", "Make it longer. Add new lines at the end of the lyrics for the new part."],
  ["replace", "🔁 Replace a part", "Redo a few seconds you don't like. Change those lines in the lyrics if you want new words."],
];

// Suno-style remixing of a finished song. Each remix is saved as a new song.
export function RemixPanel(props: { songId: string; genre: string; lyrics: string; durationSec: number; prices: RemixPrices; onDone: () => void }) {
  const [kind, setKind] = useState<Kind>("cover");
  const [style, setStyle] = useState("");
  const [lyrics, setLyrics] = useState(props.lyrics);
  const [extendSec, setExtendSec] = useState(30);
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(Math.min(15, props.durationSec));
  const [busy, setBusy] = useState(false);
  const [styling, setStyling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needCredits, setNeedCredits] = useState(false);

  async function enhanceStyle() {
    setStyling(true);
    setError(null);
    const res = await fetch("/api/songs/style", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ genre: props.genre, idea: style }),
    });
    const data = await res.json().catch(() => ({}));
    setStyling(false);
    if (!res.ok) return setError(data.error ?? "Couldn't write a style");
    setStyle(data.style);
  }

  async function remix() {
    setBusy(true);
    setError(null);
    setNeedCredits(false);
    const body = {
      kind,
      ...(style.trim() ? { style } : {}),
      ...(lyrics.trim() !== props.lyrics.trim() ? { lyrics } : {}),
      ...(kind === "extend" ? { extendSec } : {}),
      ...(kind === "replace" ? { startSec, endSec } : {}),
    };
    const res = await fetch(`/api/songs/${props.songId}/remix`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setNeedCredits(Boolean(data.needCredits));
      return setError(data.error ?? "Couldn't remix the song");
    }
    props.onDone();
  }

  const num = (set: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => set(Number(e.target.value));
  const id = (name: string) => `${name}-${props.songId}`;
  return (
    <div className="panel">
      <div className="ideas">
        {KINDS.map(([k, label]) => (
          <button type="button" key={k} className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{label} · {props.prices[k]}</button>
        ))}
      </div>
      <p className="muted">{KINDS.find(([k]) => k === kind)![2]}</p>

      <label htmlFor={id("rstyle")}>{kind === "cover" ? "New style" : "Style (optional)"}</label>
      <input id={id("rstyle")} type="text" value={style} onChange={(e) => setStyle(e.target.value)} maxLength={300} placeholder="e.g. lo-fi chill, soft piano, 75 bpm" />
      <button type="button" className="secondary" onClick={enhanceStyle} disabled={styling}>{styling ? "Writing…" : "✨ Enhance style"}</button>

      {kind === "extend" && (
        <>
          <label htmlFor={id("rext")}>Add</label>
          <select id={id("rext")} value={extendSec} onChange={(e) => setExtendSec(Number(e.target.value))}>
            {[15, 30, 60].map((s) => <option key={s} value={s}>{s} seconds</option>)}
          </select>
        </>
      )}
      {kind === "replace" && (
        <div className="row">
          <div>
            <label htmlFor={id("rstart")}>From (s)</label>
            <input id={id("rstart")} type="number" min={0} max={props.durationSec} step={1} value={startSec} onChange={num(setStartSec)} />
          </div>
          <div>
            <label htmlFor={id("rend")}>To (s)</label>
            <input id={id("rend")} type="number" min={1} max={props.durationSec} step={1} value={endSec} onChange={num(setEndSec)} />
          </div>
        </div>
      )}
      {kind !== "cover" && (
        <>
          <label htmlFor={id("rlyrics")}>Lyrics</label>
          <textarea id={id("rlyrics")} value={lyrics} onChange={(e) => setLyrics(e.target.value)} maxLength={3000} style={{ minHeight: 160 }} />
        </>
      )}
      <button type="button" onClick={remix} disabled={busy || (kind === "cover" && style.trim().length < 3)}>
        {busy ? "Starting…" : `Remix · ${props.prices[kind]} credits`}
      </button>
      {error && (
        <span className="muted">
          {error} {needCredits && <a href="/billing">Get credits</a>}
        </span>
      )}
    </div>
  );
}
