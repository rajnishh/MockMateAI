"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";

type Song = {
  id: string;
  title: string;
  genre: string;
  status: string;
  error: string | null;
  audioUrl: string | null;
  createdAt: string;
};

// Mirrors src/lib/songs/styles.ts (ids and labels only).
const GENRES = [
  ["bollywood-romantic", "Bollywood romantic"],
  ["punjabi-pop", "Punjabi pop"],
  ["kids-rhyme", "Kids rhyme"],
  ["devotional", "Devotional / bhajan"],
  ["indie-acoustic", "Indie acoustic"],
  ["lofi", "Lo-fi chill"],
  ["desi-hip-hop", "Desi hip-hop"],
  ["pop", "Pop"],
  ["edm", "EDM"],
  ["sufi", "Sufi"],
] as const;
const MOODS = ["happy", "romantic", "sad", "energetic", "peaceful", "funny", "motivational"];

async function postJson<T>(url: string, body: unknown): Promise<{ ok: boolean; data: T & { error?: string; needCredits?: boolean } }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, data: await res.json() };
}

export default function SongsPage() {
  const [topic, setTopic] = useState("");
  const [genre, setGenre] = useState<string>("bollywood-romantic");
  const [mood, setMood] = useState("happy");
  const [language, setLanguage] = useState("hi");
  const [durationSec, setDurationSec] = useState(60);
  const [kidSafe, setKidSafe] = useState(false);
  const [title, setTitle] = useState("");
  const [lyrics, setLyrics] = useState("");

  const [songs, setSongs] = useState<Song[]>([]);
  const [credits, setCredits] = useState(4);
  const [available, setAvailable] = useState(true);
  const [writing, setWriting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needCredits, setNeedCredits] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/songs");
    if (!res.ok) return;
    const d = await res.json();
    setSongs(d.songs);
    setCredits(d.credits);
    setAvailable(d.available);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while any song is still being made.
  useEffect(() => {
    if (!songs.some((s) => s.status === "queued" || s.status === "running")) return;
    const t = setTimeout(load, 5000);
    return () => clearTimeout(t);
  }, [songs, load]);

  const options = { topic, genre, mood, language, durationSec, kidSafe };

  async function writeWithAi() {
    setWriting(true);
    setError(null);
    const { ok, data } = await postJson<{ title: string; lyrics: string }>("/api/songs/lyrics", options);
    setWriting(false);
    if (!ok) return setError(data.error ?? "Couldn't write lyrics");
    setTitle(data.title);
    setLyrics(data.lyrics);
  }

  async function makeSong(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNeedCredits(false);
    const { ok, data } = await postJson<{ id: string }>("/api/songs", { ...options, title, lyrics });
    setSubmitting(false);
    if (!ok) {
      setNeedCredits(Boolean(data.needCredits));
      return setError(data.error ?? "Something went wrong");
    }
    load();
  }

  return (
    <main>
      <header className="top">
        <h1>Song Studio</h1>
        <Link href="/">← Create</Link>
      </header>
      <p className="muted">Write a song about anything and hear it sung, in Hindi, English or Hinglish.</p>
      {!available && <div className="status">Song Studio isn&apos;t set up on this server yet.</div>}

      <form onSubmit={makeSong}>
        <label htmlFor="topic">What is the song about?</label>
        <input id="topic" type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. my grandmother's kitchen on a rainy day" required />

        <label>Style</label>
        <div className="ideas">
          {GENRES.map(([id, label]) => (
            <button type="button" key={id} aria-pressed={genre === id} className="chip" onClick={() => setGenre(id)}>{label}</button>
          ))}
        </div>

        <div className="row">
          <div>
            <label htmlFor="mood">Mood</label>
            <select id="mood" value={mood} onChange={(e) => setMood(e.target.value)}>
              {MOODS.map((m) => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="lang">Language</label>
            <select id="lang" value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="hi">हिन्दी</option>
              <option value="hinglish">Hinglish</option>
              <option value="en">English</option>
            </select>
          </div>
          <div>
            <label htmlFor="len">Length</label>
            <select id="len" value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value))}>
              <option value={30}>30 s</option>
              <option value={60}>1 min</option>
              <option value={120}>2 min</option>
            </select>
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={kidSafe} onChange={(e) => setKidSafe(e.target.checked)} /> For kids
        </label>

        <div className="actions">
          <button type="button" className="secondary" onClick={writeWithAi} disabled={writing || topic.trim().length < 3}>
            {writing ? "Writing…" : "✨ Write lyrics with AI"}
          </button>
        </div>

        <label htmlFor="title">Title</label>
        <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required />
        <label htmlFor="lyrics">Lyrics</label>
        <textarea
          id="lyrics"
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
          placeholder={"[Verse]\n...\n\n[Chorus]\n..."}
          style={{ minHeight: 260 }}
          required
        />
        <p className="muted">
          Use [Verse] and [Chorus] on their own lines. Songs can&apos;t name or imitate real singers or bands. A song costs {credits} credits.
        </p>
        <button type="submit" disabled={submitting || !available}>{submitting ? "Starting…" : `Make song · ${credits} credits`}</button>
      </form>

      {error && (
        <div className="status">
          {error} {needCredits && <a href="/billing">Get credits</a>}
        </div>
      )}

      {songs.length > 0 && (
        <section>
          <h2>My songs</h2>
          <div className="library">
            {songs.map((s) => (
              <div key={s.id} className="song">
                <div className="song-head">
                  <strong>{s.title}</strong>
                  <span className="muted">{s.status === "completed" ? GENRES.find(([id]) => id === s.genre)?.[1] : s.status === "failed" ? "failed, credits refunded" : "making…"}</span>
                </div>
                {s.audioUrl && (
                  <>
                    <audio src={s.audioUrl} controls preload="none" />
                    <a href={s.audioUrl} download>Download</a>
                  </>
                )}
                {s.error && <span className="muted">{s.error}</span>}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
