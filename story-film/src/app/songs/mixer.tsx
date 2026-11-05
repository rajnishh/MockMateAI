"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtTime, postJson, type SongAudio, type SoundPresetInfo, type StudioSong } from "./studio-types";

const STEMS = [
  { id: "vocals", label: "Vocals", color: "var(--brand)" },
  { id: "drums", label: "Drums", color: "var(--teal)" },
  { id: "bass", label: "Bass", color: "var(--pop)" },
  { id: "other", label: "Music", color: "var(--ink-muted)" },
] as const;
type Stem = (typeof STEMS)[number]["id"];

interface StemsView {
  status: "none" | "running" | "ready" | "failed";
  error?: string;
  credits: number;
  stems: Record<Stem, string> | null;
}

// Volume after mute and solo: soloed stems play alone; muted ones are silent.
export function heardGain(stem: Stem, gains: Record<Stem, number>, muted: Set<Stem>, solo: Set<Stem>): number {
  if (solo.size) return solo.has(stem) ? gains[stem] : 0;
  return muted.has(stem) ? 0 : gains[stem];
}

// The four stems playing together in Web Audio, so the mixer is heard live and in sync.
function useStemPlayer(urls: Record<Stem, string> | null) {
  const ctx = useRef<AudioContext | null>(null);
  const buffers = useRef<Partial<Record<Stem, AudioBuffer>>>({});
  const nodes = useRef<{ sources: AudioBufferSourceNode[]; gains: Partial<Record<Stem, GainNode>> } | null>(null);
  const started = useRef({ at: 0, offset: 0 });
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);

  const stop = useCallback(() => {
    nodes.current?.sources.forEach((s) => {
      s.onended = null;
      s.stop();
    });
    if (nodes.current && ctx.current) started.current.offset += ctx.current.currentTime - started.current.at;
    nodes.current = null;
    setPlaying(false);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => ctx.current && setPosition(started.current.offset + ctx.current.currentTime - started.current.at), 200);
    return () => clearInterval(t);
  }, [playing]);

  useEffect(() => () => {
    stop();
    void ctx.current?.close();
  }, [stop]);

  async function play(gainOf: (s: Stem) => number, from?: number) {
    if (!urls) return;
    ctx.current ??= new AudioContext();
    const c = ctx.current;
    await c.resume();
    if (STEMS.some((s) => !buffers.current[s.id])) {
      setLoading(true);
      try {
        await Promise.all(
          STEMS.map(async (s) => {
            buffers.current[s.id] ??= await c.decodeAudioData(await (await fetch(urls[s.id])).arrayBuffer());
          }),
        );
      } finally {
        setLoading(false);
      }
    }
    const length = buffers.current.vocals!.duration;
    let offset = from ?? started.current.offset;
    if (offset >= length - 0.25) offset = 0;
    const gains: Partial<Record<Stem, GainNode>> = {};
    const sources = STEMS.map((s) => {
      const src = c.createBufferSource();
      src.buffer = buffers.current[s.id]!;
      const g = c.createGain();
      g.gain.value = gainOf(s.id);
      src.connect(g).connect(c.destination);
      gains[s.id] = g;
      return src;
    });
    const at = c.currentTime + 0.05;
    sources.forEach((s) => s.start(at, offset));
    sources[0].onended = () => {
      nodes.current = null;
      started.current.offset = 0;
      setPlaying(false);
      setPosition(0);
    };
    nodes.current = { sources, gains };
    started.current = { at, offset };
    setPlaying(true);
  }

  function setGain(stem: Stem, value: number) {
    const g = nodes.current?.gains[stem];
    if (g && ctx.current) g.gain.setTargetAtTime(value, ctx.current.currentTime, 0.02);
  }

  return { loading, playing, position, play, stop, setGain };
}

// The Mix tab: split into stems, set levels with mute and solo, add a sound, save as a new song.
export function Mixer({ song, presets, stemsCredits, audio, onSaved }: { song: StudioSong; presets: SoundPresetInfo[]; stemsCredits: number; audio: SongAudio; onSaved: (id: string) => void }) {
  const [stems, setStems] = useState<StemsView | null>(null);
  const [gains, setGains] = useState<Record<Stem, number>>({ vocals: 1, drums: 1, bass: 1, other: 1 });
  const [muted, setMuted] = useState<Set<Stem>>(new Set());
  const [solo, setSolo] = useState<Set<Stem>>(new Set());
  const [preset, setPreset] = useState<string | null>(null);
  // The sound whose preview is playing.
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; credits?: boolean } | null>(null);
  const preview = useRef<HTMLAudioElement | null>(null);
  const player = useStemPlayer(stems?.status === "ready" ? stems.stems : null);
  const ready = stems?.status === "ready";

  const loadStems = useCallback(async () => {
    const res = await fetch(`/api/songs/${song.id}/stems`);
    if (res.ok) setStems(await res.json());
  }, [song.id]);

  useEffect(() => {
    void loadStems();
  }, [loadStems]);

  useEffect(() => {
    if (stems?.status !== "running") return;
    const t = setTimeout(loadStems, 3000);
    return () => clearTimeout(t);
  }, [stems, loadStems]);

  // Live levels while the stems play.
  useEffect(() => {
    STEMS.forEach((s) => player.setGain(s.id, heardGain(s.id, gains, muted, solo)));
  }, [gains, muted, solo, player]);

  useEffect(() => () => preview.current?.pause(), []);

  async function split() {
    setError(null);
    const { ok, data } = await postJson<StemsView>(`/api/songs/${song.id}/stems`, {});
    if (!ok) return setError({ text: data.error ?? "Couldn't split the song", credits: data.needCredits });
    setStems(data);
  }

  function togglePlay() {
    if (player.playing) return player.stop();
    audio.pause();
    preview.current?.pause();
    setPreviewing(null);
    void player.play((s) => heardGain(s, gains, muted, solo), player.position || audio.position);
  }

  function toggleSet(set: Set<Stem>, stem: Stem, update: (s: Set<Stem>) => void) {
    const next = new Set(set);
    if (next.has(stem)) next.delete(stem);
    else next.add(stem);
    update(next);
  }

  function hear(id: string) {
    player.stop();
    audio.pause();
    preview.current?.pause();
    if (previewing === id) return setPreviewing(null);
    const a = new Audio(`/api/songs/${song.id}/mix/preview?preset=${id}`);
    a.onended = () => setPreviewing(null);
    a.onerror = () => {
      setPreviewing(null);
      setError({ text: "Couldn't play the preview" });
    };
    preview.current = a;
    setPreviewing(id);
    setPreset(id);
    void a.play();
  }

  const changed = ready && STEMS.some((s) => Math.abs(heardGain(s.id, gains, muted, solo) - 1) > 0.01);
  const silent = ready && STEMS.every((s) => heardGain(s.id, gains, muted, solo) === 0);

  async function save() {
    setBusy(true);
    setError(null);
    const body = {
      ...(changed ? { gains: Object.fromEntries(STEMS.map((s) => [s.id, heardGain(s.id, gains, muted, solo)])) } : {}),
      ...(preset ? { preset } : {}),
    };
    const { ok, data } = await postJson<{ id: string }>(`/api/songs/${song.id}/mix`, body);
    setBusy(false);
    if (!ok) return setError({ text: data.error ?? "Couldn't save the mix" });
    onSaved(data.id);
  }

  return (
    <section className="card st-panel" aria-label="Mix">
      <div className="st-section-head">
        <h3>Parts</h3>
        {ready && (
          <button type="button" className="secondary st-small" onClick={togglePlay} disabled={player.loading}>
            {player.loading ? "Loading…" : player.playing ? `❚❚ ${fmtTime(player.position)}` : "▶ Play mix"}
          </button>
        )}
      </div>

      {!stems || stems.status === "none" || stems.status === "failed" ? (
        <div className="st-split">
          <p className="muted">Split the song into vocals, drums, bass and music to turn each one up or down. You can download them too.</p>
          {stems?.status === "failed" && <p className="st-error">{stems.error ?? "Splitting didn't work"}. Your credit was refunded.</p>}
          <button type="button" onClick={split} disabled={!stems}>
            {stems?.status === "failed" ? "Try again" : "Split into parts"} · {stems?.credits ?? stemsCredits} {(stems?.credits ?? stemsCredits) === 1 ? "credit" : "credits"}
          </button>
        </div>
      ) : stems.status === "running" ? (
        <div className="st-split" aria-live="polite">
          <div className="st-eq" aria-hidden="true"><span /><span /><span /><span /></div>
          <p className="muted">Splitting into vocals, drums, bass and music. About a minute.</p>
        </div>
      ) : (
        <div className="st-mixer">
          {STEMS.map((s) => {
            const heard = heardGain(s.id, gains, muted, solo);
            return (
              <div key={s.id} className={`st-stem${heard === 0 ? " off" : ""}`} style={{ "--c": s.color } as React.CSSProperties}>
                <span className="st-stem-name">{s.label}</span>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={gains[s.id]}
                  aria-label={`${s.label} volume`}
                  aria-valuetext={`${Math.round(gains[s.id] * 100)}%`}
                  onChange={(e) => setGains({ ...gains, [s.id]: Number(e.target.value) })}
                  style={{ "--fill": `${(gains[s.id] / 2) * 100}%` } as React.CSSProperties}
                />
                <span className="st-stem-val">{Math.round(gains[s.id] * 100)}%</span>
                <button type="button" className="st-ms" aria-pressed={muted.has(s.id)} aria-label={`Mute ${s.label}`} onClick={() => toggleSet(muted, s.id, setMuted)}>M</button>
                <button type="button" className="st-ms solo" aria-pressed={solo.has(s.id)} aria-label={`Solo ${s.label}`} onClick={() => toggleSet(solo, s.id, setSolo)}>S</button>
                <a className="st-stem-dl" href={stems.stems![s.id]} download aria-label={`Download ${s.label}`}>↓</a>
              </div>
            );
          })}
        </div>
      )}

      <div className="st-section-head">
        <h3>Sound</h3>
        <span className="muted">Free</span>
      </div>
      <div className="st-fx" role="radiogroup" aria-label="Sound">
        {presets.map((p) => (
          <div key={p.id} className="st-fx-item" data-on={preset === p.id || undefined}>
            <button type="button" role="radio" aria-checked={preset === p.id} aria-label={`${p.label}. ${p.help}`} className="st-fx-pick" onClick={() => setPreset(preset === p.id ? null : p.id)}>
              <strong>{p.label}</strong>
              <span>{p.help}</span>
            </button>
            <button type="button" className="st-fx-hear" aria-label={previewing === p.id ? `Stop ${p.label} preview` : `Hear ${p.label}`} onClick={() => hear(p.id)}>
              {previewing === p.id ? "❚❚" : "▶"}
            </button>
          </div>
        ))}
      </div>
      {preset && changed && <p className="muted">The preview plays the original with the sound; your saved song gets both your levels and the sound.</p>}
      {error && (
        <p className="st-error">
          {error.text} {error.credits && <a href="/billing">Get credits</a>}
        </p>
      )}
      <button type="button" onClick={save} disabled={busy || silent || (!changed && !preset)}>
        {busy ? "Saving…" : "Save mix · free"}
      </button>
      <p className="muted st-center">Saved as a new song. The original stays as it is.</p>
    </section>
  );
}
