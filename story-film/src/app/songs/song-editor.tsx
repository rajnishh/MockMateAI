"use client";

import { useState } from "react";
import { postJson, type SongAudio, type StudioSong } from "./studio-types";
import { type Range, Waveform } from "./waveform";

const SPEEDS = [0.8, 0.9, 1, 1.1, 1.25];
const FADES = [0, 1, 3, 5];

// Trim on the waveform, fade and speed for a finished song. Free; saves a new copy.
export function SongEditor({ song, peaks, audio, onDone }: { song: StudioSong; peaks: number[] | null; audio: SongAudio; onDone: (id: string) => void }) {
  const [keep, setKeep] = useState<Range>({ start: 0, end: song.durationSec });
  const [fadeInSec, setFadeInSec] = useState(0);
  const [fadeOutSec, setFadeOutSec] = useState(3);
  const [speed, setSpeed] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const { ok, data } = await postJson<{ id: string }>(`/api/songs/${song.id}/edit`, {
      startSec: keep.start,
      endSec: keep.end < song.durationSec ? keep.end : undefined,
      fadeInSec,
      fadeOutSec,
      speed,
    });
    setSaving(false);
    if (!ok) return setError(data.error ?? "Couldn't edit the song");
    onDone(data.id);
  }

  const chips = (values: number[], value: number, set: (n: number) => void, label: (n: number) => string, name: string) => (
    <div className="ideas" role="radiogroup" aria-label={name}>
      {values.map((v) => (
        <button type="button" key={v} role="radio" className="chip" aria-checked={value === v} aria-pressed={value === v} onClick={() => set(v)}>{label(v)}</button>
      ))}
    </div>
  );

  return (
    <section className="card st-panel" aria-label="Edit">
      <div className="st-section-head">
        <h3>Trim</h3>
        <button type="button" className="secondary st-small" onClick={() => (audio.playing ? audio.pause() : audio.playPart(keep.start, keep.end))}>
          {audio.playing ? "❚❚ Stop" : "▶ Play"}
        </button>
      </div>
      <Waveform peaks={peaks} durationSec={song.durationSec} position={audio.position} range={keep} onRange={setKeep} minSec={1} label="Keep" />
      <p className="muted">Drag the edges to keep just the part you want, like a 30-second hook for a reel.</p>
      <h3 className="st-sub">Fade in</h3>
      {chips(FADES, fadeInSec, setFadeInSec, (v) => (v ? `${v} s` : "None"), "Fade in")}
      <h3 className="st-sub">Fade out</h3>
      {chips(FADES, fadeOutSec, setFadeOutSec, (v) => (v ? `${v} s` : "None"), "Fade out")}
      <h3 className="st-sub">Speed</h3>
      {chips(SPEEDS, speed, setSpeed, (v) => (v === 1 ? "Normal" : `${v}×`), "Speed")}
      {error && <p className="st-error">{error}</p>}
      <button type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save as new copy · free"}</button>
    </section>
  );
}
