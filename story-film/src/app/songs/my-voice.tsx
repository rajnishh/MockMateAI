"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

export type Voice = { id: string; name: string; durationSec: number; consentedAt: string };
type VoiceData = {
  available: boolean;
  voices: Voice[];
  consent: { code: string; statement: string };
  limits: { minSec: number; maxSec: number; maxVoices: number };
};

// Records (or accepts an upload of) the user's own voice, with spoken consent.
export function MyVoices({ onChange }: { onChange: (voices: Voice[]) => void }) {
  const [data, setData] = useState<VoiceData | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("My voice");
  const [agreed, setAgreed] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [clip, setClip] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    const res = await fetch("/api/voices");
    if (!res.ok) return;
    const d: VoiceData = await res.json();
    setData(d);
    onChange(d.voices);
  }

  useEffect(() => {
    load();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startRecording() {
    setError(null);
    setClip(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setClip(new Blob(chunks, { type: rec.mimeType }));
      };
      rec.start();
      recorder.current = rec;
      setSeconds(0);
      setRecording(true);
      timer.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= (data?.limits.maxSec ?? 60)) stopRecording();
          return s + 1;
        });
      }, 1000);
    } catch {
      setError("Microphone access was blocked. Allow it, or upload a recording instead.");
    }
  }

  function stopRecording() {
    recorder.current?.state === "recording" && recorder.current.stop();
    if (timer.current) clearInterval(timer.current);
    setRecording(false);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!clip) return setError("Record or upload your voice first.");
    setSaving(true);
    setError(null);
    const form = new FormData();
    form.set("name", name);
    form.set("consent", agreed ? "yes" : "no");
    form.set("audio", clip, "voice");
    const res = await fetch("/api/voices", { method: "POST", body: form });
    const body = await res.json();
    setSaving(false);
    if (!res.ok) return setError(body.error);
    setOpen(false);
    setClip(null);
    setAgreed(false);
    load();
  }

  async function remove(v: Voice) {
    if (!confirm(`Delete "${v.name}"? The recording is erased; songs already made stay.`)) return;
    await fetch(`/api/voices/${v.id}`, { method: "DELETE" });
    load();
  }

  if (!data?.available) return null;

  return (
    <section>
      <h2>My voice</h2>
      <p className="muted">Record your own voice once, then have any of your songs sung in it.</p>
      <div className="library">
        {data.voices.map((v) => (
          <div key={v.id} className="post">
            <span>🎤 {v.name}</span>
            <button type="button" className="secondary" onClick={() => remove(v)} style={{ width: "auto" }}>Delete</button>
          </div>
        ))}
      </div>
      {!open ? (
        data.voices.length < data.limits.maxVoices && (
          <div className="actions">
            <button type="button" className="secondary" onClick={() => setOpen(true)}>+ Add my voice</button>
          </div>
        )
      ) : (
        <form className="panel" onSubmit={save}>
          <p>
            Read this aloud in a quiet place, then keep talking or singing until you reach {data.limits.minSec}-
            {data.limits.maxSec} seconds:
          </p>
          <blockquote className="consent">{data.consent.statement}</blockquote>
          <div className="actions">
            {recording ? (
              <button type="button" onClick={stopRecording}>■ Stop ({seconds}s)</button>
            ) : (
              <button type="button" onClick={startRecording}>● {clip ? "Record again" : "Record"}</button>
            )}
          </div>
          {clip && !recording && <audio src={URL.createObjectURL(clip)} controls />}
          <label htmlFor="voice-file" className="muted">Or upload a recording of yourself reading it</label>
          <input id="voice-file" type="file" accept="audio/*" onChange={(e) => e.target.files?.[0] && setClip(e.target.files[0])} />
          <label htmlFor="voice-name">Name</label>
          <input id="voice-name" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          <label className="check">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            This is my own voice, not anyone else&apos;s. I agree to it being used to make songs in my account, and I can delete it anytime.
          </label>
          <div className="actions">
            <button type="submit" disabled={saving || !agreed || !clip}>{saving ? "Checking…" : "Save my voice"}</button>
            <button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
      {error && <div className="status">{error}</div>}
    </section>
  );
}
