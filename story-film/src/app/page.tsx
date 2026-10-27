"use client";

import { type FormEvent, useEffect, useState } from "react";

type Status = { state: string; stage: string | null; title: string | null; error: string | null };

const STAGE_LABELS: Record<string, string> = {
  script: "Writing the script",
  keyframes: "Drawing the scenes",
  clips: "Animating clips",
  audio: "Recording narration and music",
  assemble: "Editing the film",
  done: "Finished",
};

export default function Home() {
  const [story, setStory] = useState("");
  const [style, setStyle] = useState("cinematic");
  const [durationSec, setDurationSec] = useState(30);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/films/${jobId}`);
      if (!res.ok) return;
      const next: Status = await res.json();
      setStatus(next);
      if (next.state === "completed" || next.state === "failed") clearInterval(timer);
    }, 4000);
    return () => clearInterval(timer);
  }, [jobId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setStatus(null);
    const res = await fetch("/api/films", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ story, style, durationSec }),
    });
    const body = await res.json();
    setSubmitting(false);
    if (!res.ok) return setError(body.error);
    setJobId(body.id);
  }

  const busy = submitting || (status !== null && status.state !== "completed" && status.state !== "failed");

  return (
    <main>
      <h1>Story to Film</h1>
      <p className="muted">Write a short story in any language. We turn it into a narrated vertical film.</p>
      <form onSubmit={submit}>
        <label htmlFor="story">Your story</label>
        <textarea id="story" value={story} onChange={(e) => setStory(e.target.value)} minLength={20} required />
        <div className="row">
          <div>
            <label htmlFor="style">Style</label>
            <select id="style" value={style} onChange={(e) => setStyle(e.target.value)}>
              <option value="cinematic">Cinematic</option>
              <option value="animated">Animated</option>
              <option value="photoreal">Photoreal</option>
            </select>
          </div>
          <div>
            <label htmlFor="duration">Length</label>
            <select id="duration" value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value))}>
              <option value={30}>30 seconds</option>
              <option value={60}>60 seconds</option>
            </select>
          </div>
        </div>
        <p className="muted">Free plan: 1 film per week, 720p, labelled “Created with AI”.</p>
        <button type="submit" disabled={busy}>{busy ? "Working…" : "Make my film"}</button>
      </form>

      {error && <div className="status">{error}</div>}
      {jobId && (
        <div className="status">
          {!status || status.state === "waiting" ? (
            <p>Queued…</p>
          ) : status.state === "failed" ? (
            <p>Something went wrong: {status.error}</p>
          ) : status.state === "completed" ? (
            <>
              <strong>{status.title}</strong>
              <video src={`/api/films/${jobId}/video`} controls playsInline />
              <p><a href={`/api/films/${jobId}/video`}>Download</a></p>
            </>
          ) : (
            <p>{STAGE_LABELS[status.stage ?? ""] ?? "Working"}…</p>
          )}
        </div>
      )}
    </main>
  );
}
