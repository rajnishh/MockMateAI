"use client";

import { useCallback, useEffect, useState } from "react";
import { GENRES } from "@/lib/songs/styles";
import { CreateForm } from "./create-form";
import { SongPlayer } from "./song-player";
import { MusicVideoPanel, type MusicVideoPrices } from "./music-video-panel";
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
  coverUrl: string | null;
};

async function postJson<T>(url: string, body: unknown): Promise<{ ok: boolean; data: T & { error?: string; needCredits?: boolean } }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

export default function SongsPage() {

  const [songs, setSongs] = useState<Song[]>([]);
  const [credits, setCredits] = useState(4);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needCredits, setNeedCredits] = useState(false);
  const [videoFor, setVideoFor] = useState<string | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceFor, setVoiceFor] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState("");
  const [characters, setCharacters] = useState<{ id: string; name: string; imageUrl: string }[]>([]);
  const [billing, setBilling] = useState<MusicVideoPrices>({ premiumAvailable: false, premiumCreditsPerShot: 12 });

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
    fetch("/api/characters").then(async (r) => r.ok && setCharacters((await r.json()).characters)).catch(() => {});
    fetch("/api/billing").then(async (r) => r.ok && setBilling(await r.json())).catch(() => {});
  }, [load]);

  // Poll while any song is still being made.
  useEffect(() => {
    if (!songs.some((s) => s.status === "queued" || s.status === "running")) return;
    const t = setTimeout(load, 5000);
    return () => clearTimeout(t);
  }, [songs, load]);

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

  return (
    <main>
      <header className="top">
        <div>
          <h1>Song Studio</h1>
          <p className="sub">Write a song about anything and hear it sung, in Hindi, Marathi, Bengali, Tamil, Telugu, Arabic, English or Hinglish.</p>
        </div>
      </header>
      {!available && <div className="status">Song Studio isn&apos;t set up on this server yet.</div>}

      <section className="create">
        <CreateForm credits={credits} available={available} onCreated={load} />
      </section>

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
                  {s.coverUrl ? (
                    // Square AI cover art, made just after the song.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.coverUrl} alt="" width={56} height={56} style={{ borderRadius: 10, objectFit: "cover", flex: "0 0 auto" }} />
                  ) : (
                    <span aria-hidden="true" style={{ width: 56, height: 56, borderRadius: 10, flex: "0 0 auto", background: "var(--hero)", display: "grid", placeItems: "center", fontSize: 24 }}>🎵</span>
                  )}
                  <strong style={{ flex: 1 }}>{s.title}</strong>
                  <span className="muted">{s.status === "completed" ? GENRES.find((g) => g.id === s.genre)?.label : s.status === "failed" ? "failed, credits refunded" : "making…"}</span>
                </div>
                {s.audioUrl && (
                  <>
                    <SongPlayer song={s} genreLabel={GENRES.find((g) => g.id === s.genre)?.label} />
                    <a href={s.audioUrl} download>Download</a>
                    <a href={`/songs/${s.id}`} style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}>🎛️ Open in Studio: mix, remix, edit</a>
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
                        prices={billing}
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
