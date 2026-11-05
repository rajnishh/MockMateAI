"use client";

import { useState } from "react";
import { postJson, type RemixKindInfo, type SongAudio, type StudioSong } from "./studio-types";
import { type Range, Waveform } from "./waveform";

// A part starts a third of the way in (often the first chorus) and runs 15 seconds.
export function defaultPart(durationSec: number, len = 15): Range {
  const l = Math.min(len, durationSec);
  const start = Math.min(Math.max(0, durationSec - l), Math.round(durationSec / 3));
  return { start, end: start + l };
}

// Suno-style remixing of a finished song, with the kinds the server lists. Each remix is a new song.
export function RemixPanel(props: { song: StudioSong; kinds: RemixKindInfo[]; peaks: number[] | null; audio: SongAudio; onDone: (id: string) => void }) {
  const { song, kinds, audio } = props;
  const [kind, setKind] = useState<string>(kinds[0]?.kind ?? "cover");
  const [style, setStyle] = useState("");
  const [lyrics, setLyrics] = useState(song.lyrics);
  const [extendSec, setExtendSec] = useState(30);
  const [part, setPart] = useState<Range>(defaultPart(song.durationSec));
  const [bars, setBars] = useState("");
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);
  const [styling, setStyling] = useState(false);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<{ text: string; credits?: boolean } | null>(null);
  const k = kinds.find((x) => x.kind === kind) ?? kinds[0];
  if (!k) return <section className="card st-panel"><p className="muted">Loading…</p></section>;

  async function enhanceStyle() {
    setStyling(true);
    setError(null);
    const { ok, data } = await postJson<{ style: string }>("/api/songs/style", { genre: song.genre, idea: style });
    setStyling(false);
    if (!ok) return setError({ text: data.error ?? "Couldn't write a style" });
    setStyle(data.style);
  }

  async function writeBars() {
    setWriting(true);
    setError(null);
    const { ok, data } = await postJson<{ bars: string }>(`/api/songs/${song.id}/rap`, { startSec: part.start, endSec: part.end, ...(idea.trim() ? { idea } : {}) });
    setWriting(false);
    if (!ok) return setError({ text: data.error ?? "Couldn't write the rap" });
    setBars(data.bars);
  }

  async function remix() {
    setBusy(true);
    setError(null);
    const body = {
      kind: k.kind,
      ...(k.style !== "none" && style.trim() ? { style } : {}),
      ...(k.lyrics && lyrics.trim() !== song.lyrics.trim() ? { lyrics } : {}),
      ...(k.extend ? { extendSec } : {}),
      ...(k.part ? { startSec: part.start, endSec: part.end } : {}),
      ...(k.bars ? { bars } : {}),
    };
    const { ok, data } = await postJson<{ id: string }>(`/api/songs/${song.id}/remix`, body);
    setBusy(false);
    if (!ok) return setError({ text: data.error ?? "Couldn't remix the song", credits: data.needCredits });
    props.onDone(data.id);
  }

  const id = (name: string) => `${name}-${song.id}`;
  const blocked = (k.style === "required" && style.trim().length < 3) || (k.bars && bars.trim().length < 10);
  return (
    <section className="card st-panel" aria-label="Remix">
      <div className="st-kinds" role="radiogroup" aria-label="Kind of remix">
        {kinds.map((x) => (
          <button type="button" role="radio" key={x.kind} className="st-kind" aria-checked={x.kind === k.kind} aria-label={`${x.label}, ${x.credits} ${x.credits === 1 ? "credit" : "credits"}`} onClick={() => setKind(x.kind)}>
            <strong>{x.label}</strong>
            <span>{x.credits} {x.credits === 1 ? "credit" : "credits"}</span>
          </button>
        ))}
      </div>
      <p className="muted">{k.help}</p>

      {k.part && (
        <>
          <div className="st-section-head">
            <h3>{k.bars ? "Part to rap over" : "Part to redo"}</h3>
            <button type="button" className="secondary st-small" onClick={() => (audio.playing ? audio.pause() : audio.playPart(part.start, part.end))}>
              {audio.playing ? "❚❚ Stop" : "▶ Play part"}
            </button>
          </div>
          <Waveform peaks={props.peaks} durationSec={song.durationSec} position={audio.position} range={part} onRange={setPart} minSec={3} maxSec={60} label="Part" />
          <p className="muted">Drag the edges or the part itself. 3 to 60 seconds.</p>
        </>
      )}

      {k.bars && (
        <>
          <label htmlFor={id("ridea")}>What&apos;s the rap about? (optional)</label>
          <input id={id("ridea")} type="text" value={idea} onChange={(e) => setIdea(e.target.value)} maxLength={200} placeholder="e.g. hustling in Mumbai, chai and big dreams" />
          <button type="button" className="secondary" onClick={writeBars} disabled={writing}>{writing ? "Writing bars…" : bars ? "✨ Write new bars" : "✨ Write rap bars"}</button>
          <label htmlFor={id("rbars")}>Rap bars</label>
          <textarea id={id("rbars")} value={bars} onChange={(e) => setBars(e.target.value)} maxLength={1200} style={{ minHeight: 140 }} placeholder="Write your own bars, one per line, or let AI write them." />
        </>
      )}

      {k.style !== "none" && (
        <>
          <label htmlFor={id("rstyle")}>{k.style === "required" ? "New style" : "Style (optional)"}</label>
          <input id={id("rstyle")} type="text" value={style} onChange={(e) => setStyle(e.target.value)} maxLength={300} placeholder="e.g. lo-fi chill, soft piano, 75 bpm" />
          <button type="button" className="secondary" onClick={enhanceStyle} disabled={styling}>{styling ? "Writing…" : "✨ Enhance style"}</button>
        </>
      )}

      {k.extend && (
        <>
          <label htmlFor={id("rext")}>Add</label>
          <div className="ideas" id={id("rext")} role="radiogroup">
            {[15, 30, 60].map((s) => (
              <button type="button" key={s} role="radio" className="chip" aria-checked={extendSec === s} aria-pressed={extendSec === s} onClick={() => setExtendSec(s)}>{s} seconds</button>
            ))}
          </div>
        </>
      )}
      {k.lyrics && (
        <>
          <label htmlFor={id("rlyrics")}>Lyrics</label>
          <textarea id={id("rlyrics")} value={lyrics} onChange={(e) => setLyrics(e.target.value)} maxLength={3000} style={{ minHeight: 160 }} />
        </>
      )}
      {error && (
        <p className="st-error">
          {error.text} {error.credits && <a href="/billing">Get credits</a>}
        </p>
      )}
      <button type="button" onClick={remix} disabled={busy || blocked}>
        {busy ? "Starting…" : `${k.label} · ${k.credits} ${k.credits === 1 ? "credit" : "credits"}`}
      </button>
    </section>
  );
}
