"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { LANGUAGES } from "@/lib/languages";
import { STYLE_CHIPS } from "@/lib/songs/styles";
import { RemixPanel, type RemixPrices } from "./remix-panel";
import { SongEditor } from "./song-editor";
import { MusicVideoPanel } from "./music-video-panel";
import { MyVoices, type Voice } from "./my-voice";

type Song = {
  id: string;
  title: string;
  genre: string;
  status: string;
  error: string | null;
  audioUrl: string | null;
  durationSec: number;
  myVoice: boolean;
  edited: boolean;
  lyrics: string;
  contentCredentials: boolean;
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
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
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
  const [style, setStyle] = useState("");
  const [vocal, setVocal] = useState("auto");
  const [twoTakes, setTwoTakes] = useState(true);
  // "ace-step": a full song; "lyria": a 30-second song (Google Lyria 3).
  const [model, setModel] = useState<"ace-step" | "lyria">("ace-step");

  const [songs, setSongs] = useState<Song[]>([]);
  const [credits, setCredits] = useState(4);
  const [available, setAvailable] = useState(true);
  const [writing, setWriting] = useState(false);
  const [styling, setStyling] = useState(false);
  const [editFor, setEditFor] = useState<string | null>(null);
  const [remixFor, setRemixFor] = useState<string | null>(null);
  const [remixPrices, setRemixPrices] = useState<RemixPrices>({ cover: 2, extend: 2, replace: 1 });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needCredits, setNeedCredits] = useState(false);
  const [videoFor, setVideoFor] = useState<string | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceFor, setVoiceFor] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState("");
  const [characters, setCharacters] = useState<{ id: string; name: string; imageUrl: string }[]>([]);
  const [billing, setBilling] = useState({ premiumAvailable: false, premiumCreditsPerShot: 8 });

  const load = useCallback(async () => {
    const res = await fetch("/api/songs");
    if (!res.ok) return;
    const d = await res.json();
    setSongs(d.songs);
    setCredits(d.credits);
    if (d.remixCredits) setRemixPrices(d.remixCredits);
    setAvailable(d.available);
  }, []);

  useEffect(() => {
    load();
    fetch("/api/characters").then(async (r) => r.ok && setCharacters((await r.json()).characters)).catch(() => {});
    fetch("/api/billing").then(async (r) => r.ok && setBilling(await r.json())).catch(() => {});
  }, [load]);

  // Poll while any song is still being made.
  useEffect(() => {
    if (!songs.some((s) => s.status === "queued" || s.status === "running")) return;
    const t = setTimeout(load, 5000);
    return () => clearTimeout(t);
  }, [songs, load]);

  const length = model === "lyria" ? 30 : durationSec;
  const options = { topic, genre, mood, language, durationSec: length, kidSafe };

  // With lines already in the box, AI grows them into a full song and keeps them; otherwise it writes from the topic.
  async function writeWithAi(enhance: boolean) {
    setWriting(true);
    setError(null);
    const { ok, data } = await postJson<{ title: string; lyrics: string }>("/api/songs/lyrics", enhance ? { ...options, draft: lyrics } : options);
    setWriting(false);
    if (!ok) return setError(data.error ?? "Couldn't write lyrics");
    if (!title || !enhance) setTitle(data.title);
    setLyrics(data.lyrics);
  }

  async function enhanceStyle() {
    setStyling(true);
    setError(null);
    const { ok, data } = await postJson<{ style: string }>("/api/songs/style", { ...options, idea: style || topic, vocal });
    setStyling(false);
    if (!ok) return setError(data.error ?? "Couldn't write a style");
    setStyle(data.style);
  }

  function addChip(chip: string) {
    setStyle((s) => (s.toLowerCase().includes(chip) ? s : s.trim() ? `${s.trim().replace(/,$/, "")}, ${chip}` : chip));
  }

  async function singInMyVoice(songId: string) {
    setError(null);
    setNeedCredits(false);
    const { ok, data } = await postJson<{ id: string }>(`/api/songs/${songId}/my-voice`, { voiceProfileId: voiceId || voices[0]?.id });
    if (!ok) {
      setNeedCredits(Boolean(data.needCredits));
      return setError(data.error ?? "Something went wrong");
    }
    setVoiceFor(null);
    load();
  }

  async function makeSong(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNeedCredits(false);
    const { ok, data } = await postJson<{ id: string }>("/api/songs", { ...options, title, lyrics, style, vocal, takes: twoTakes ? 2 : 1, model });
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
        <div>
          <h1>Song Studio</h1>
          <p className="sub">Write a song about anything and hear it sung, in Hindi, Marathi, Bengali, Tamil, Telugu, Arabic, English or Hinglish.</p>
        </div>
      </header>
      {!available && <div className="status">Song Studio isn&apos;t set up on this server yet.</div>}

      <form onSubmit={makeSong}>
        <label htmlFor="topic">What is the song about?</label>
        <input id="topic" type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. my grandmother's kitchen on a rainy day" />

        <label>Song</label>
        <div className="ideas">
          <button type="button" className="chip" aria-pressed={model === "ace-step"} onClick={() => setModel("ace-step")}>🎵 Full song</button>
          <button type="button" className="chip" aria-pressed={model === "lyria"} onClick={() => setModel("lyria")}>⚡ Short song · 30 s</button>
        </div>
        {model === "lyria" && <p className="muted">A 30-second song for a reel or a hook, made with Google Lyria. Keep the lyrics short: about 6–8 lines.</p>}

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
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.native}</option>)}
              <option value="hinglish">Hinglish</option>
            </select>
          </div>
          <div>
            <label htmlFor="len">Length</label>
            <select id="len" value={length} onChange={(e) => setDurationSec(Number(e.target.value))} disabled={model === "lyria"}>
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
          <button type="button" className="secondary" onClick={() => writeWithAi(false)} disabled={writing || topic.trim().length < 3}>
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
        <div className="actions">
          <button type="button" className="secondary" onClick={() => writeWithAi(true)} disabled={writing || lyrics.trim().length < 10}>
            {writing ? "Writing…" : "✨ Enhance my lyrics"}
          </button>
          <span className="muted">Write a few lines of your own and AI makes them a full song, keeping your lines.</span>
        </div>

        <label htmlFor="style">Sound (optional)</label>
        <textarea
          id="style"
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          maxLength={500}
          placeholder="e.g. sad papa-beti song, soft piano. Leave empty to use the style above."
          style={{ minHeight: 70 }}
        />
        <div className="ideas">
          {STYLE_CHIPS.map((chip) => {
            const on = style.toLowerCase().includes(chip);
            return <button type="button" key={chip} className="chip" aria-pressed={on} onClick={() => addChip(chip)}>{on ? chip : `+ ${chip}`}</button>;
          })}
        </div>
        <div className="actions">
          <button type="button" className="secondary" onClick={enhanceStyle} disabled={styling}>
            {styling ? "Writing…" : "✨ Enhance style"}
          </button>
          <span className="muted">Turns a few words into a detailed sound: instruments, tempo, vocals.</span>
        </div>

        <div className="row">
          <div>
            <label htmlFor="vocal">Voice</label>
            <select id="vocal" value={vocal} onChange={(e) => setVocal(e.target.value)}>
              <option value="auto">Any</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="duet">Duet</option>
            </select>
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={twoTakes} onChange={(e) => setTwoTakes(e.target.checked)} /> Make 2 versions to choose from (same price)
        </label>
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

      <MyVoices onChange={setVoices} />

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
                    {editFor === s.id ? (
                      <SongEditor
                        songId={s.id}
                        durationSec={s.durationSec}
                        onDone={() => {
                          setEditFor(null);
                          load();
                        }}
                      />
                    ) : (
                      <button type="button" className="secondary" onClick={() => setEditFor(s.id)}>✂️ Trim, fade, speed</button>
                    )}
                    {available && (remixFor === s.id ? (
                      <RemixPanel
                        songId={s.id}
                        genre={s.genre}
                        lyrics={s.lyrics}
                        durationSec={s.durationSec}
                        prices={remixPrices}
                        onDone={() => {
                          setRemixFor(null);
                          load();
                        }}
                      />
                    ) : (
                      <button type="button" className="secondary" onClick={() => setRemixFor(s.id)}>🎛️ Remix: cover, extend, replace a part</button>
                    ))}
                    {s.contentCredentials && (
                      <span className="muted cc">
                        <span className="cc-badge">cr</span> Content Credentials: marked as AI-generated
                      </span>
                    )}
                    {voices.length > 0 && !s.myVoice && (
                      voiceFor === s.id ? (
                        <div className="row">
                          <select value={voiceId || voices[0].id} onChange={(e) => setVoiceId(e.target.value)} aria-label="Voice">
                            {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                          </select>
                          <button type="button" onClick={() => singInMyVoice(s.id)}>Sing it · 4 credits</button>
                        </div>
                      ) : (
                        <button type="button" className="secondary" onClick={() => setVoiceFor(s.id)}>🎤 Sing it in my voice</button>
                      )
                    )}
                    {videoFor === s.id ? (
                      <MusicVideoPanel
                        songId={s.id}
                        durationSec={s.durationSec}
                        characters={characters}
                        premiumAvailable={billing.premiumAvailable}
                        premiumCreditsPerShot={billing.premiumCreditsPerShot}
                      />
                    ) : (
                      <button type="button" className="secondary" onClick={() => setVideoFor(s.id)}>🎬 Make music video</button>
                    )}
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
