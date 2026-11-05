"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { GENRES } from "@/lib/songs/styles";
import { Mixer } from "../mixer";
import { RemixPanel } from "../remix-panel";
import { SongEditor } from "../song-editor";
import { fmtTime, type SongAudio, type StudioInfo, type StudioSong } from "../studio-types";
import { Waveform } from "../waveform";
import "../studio.css";

type Tab = "mix" | "remix" | "edit";
const TABS: [Tab, string][] = [["mix", "Mix"], ["remix", "Remix"], ["edit", "Edit"]];

// Plays the song through one <audio>, with a part-player for Remix and Edit.
function useSongAudio(src: string | null): SongAudio & { ref: React.RefObject<HTMLAudioElement | null> } {
  const ref = useRef<HTMLAudioElement>(null);
  const stopAt = useRef<number | null>(null);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const time = () => {
      setPosition(a.currentTime);
      if (stopAt.current !== null && a.currentTime >= stopAt.current) {
        stopAt.current = null;
        a.pause();
      }
    };
    const on = () => setPlaying(true);
    const off = () => setPlaying(false);
    a.addEventListener("timeupdate", time);
    a.addEventListener("play", on);
    a.addEventListener("pause", off);
    a.addEventListener("ended", off);
    return () => {
      a.removeEventListener("timeupdate", time);
      a.removeEventListener("play", on);
      a.removeEventListener("pause", off);
      a.removeEventListener("ended", off);
    };
  }, [src]);

  return {
    ref,
    position,
    playing,
    toggle: () => {
      const a = ref.current;
      if (!a) return;
      stopAt.current = null;
      if (a.paused) void a.play();
      else a.pause();
    },
    seek: (sec) => {
      if (ref.current) ref.current.currentTime = sec;
      setPosition(sec);
    },
    playPart: (start, end) => {
      const a = ref.current;
      if (!a) return;
      a.currentTime = start;
      stopAt.current = end;
      void a.play();
    },
    pause: () => ref.current?.pause(),
  };
}

// The Studio: one screen per song with Mix, Remix and Edit. Everything is saved as a new song.
export default function StudioPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [song, setSong] = useState<StudioSong | null>(null);
  const [info, setInfo] = useState<StudioInfo | null>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [tab, setTab] = useState<Tab>("mix");
  const [error, setError] = useState<string | null>(null);
  const audio = useSongAudio(song?.audioUrl ?? null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/songs/${id}`);
    if (!res.ok) return setError("Song not found");
    setSong(await res.json());
  }, [id]);

  useEffect(() => {
    void load();
    fetch("/api/songs")
      .then((r) => r.json())
      .then((d) => setInfo({ remixKinds: d.remixKinds ?? [], soundPresets: d.soundPresets ?? [], stemsCredits: d.stemsCredits ?? 1, available: d.available !== false }))
      .catch(() => undefined);
  }, [load]);

  // A new mix or remix opens while it's still being made; check until it's ready.
  useEffect(() => {
    if (!song || song.status === "completed" || song.status === "failed") return;
    const t = setTimeout(load, 4000);
    return () => clearTimeout(t);
  }, [song, load]);

  useEffect(() => {
    if (song?.status !== "completed") return;
    fetch(`/api/songs/${id}/peaks`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setPeaks(d.peaks))
      .catch(() => undefined);
  }, [id, song?.status]);

  const opened = (newId: string) => router.push(`/songs/${newId}`);
  const genre = song && GENRES.find((g) => g.id === song.genre)?.label;

  return (
    <main className="studio">
      <a href="/songs" className="st-back">← My songs</a>
      {error && <div className="status">{error}</div>}
      {song && (
        <>
          <header className="st-head">
            <div className="st-art" aria-hidden="true">
              <span>♪</span>
            </div>
            <div>
              <p className="over">Studio</p>
              <h1>{song.title}</h1>
              <p className="sub">{[genre, fmtTime(song.durationSec), "Made with AI"].filter(Boolean).join(" · ")}</p>
            </div>
          </header>

          {song.status !== "completed" ? (
            <div className="status">
              <strong>{song.status === "failed" ? "This one didn't work" : "Making your song…"}</strong>
              <span className="muted">{song.status === "failed" ? `${song.error ?? "Something went wrong"}. Any credits were refunded.` : "It takes a minute or two. You can leave this page; it'll be in My songs."}</span>
            </div>
          ) : (
            <>
              {/* The player: the song-player work can replace this block. */}
              <section className="st-player card">
                <audio ref={audio.ref} src={song.audioUrl ?? undefined} preload="metadata" />
                <button type="button" className="st-play" onClick={audio.toggle} aria-label={audio.playing ? "Pause" : "Play"}>
                  {audio.playing ? "❚❚" : "▶"}
                </button>
                <Waveform peaks={peaks} durationSec={song.durationSec} position={audio.position} onSeek={audio.seek} />
                <a href={song.audioUrl ?? undefined} download className="st-dl">Download</a>
              </section>

              <div className="tabs st-tabs" role="tablist">
                {TABS.map(([t, label]) => (
                  <button type="button" key={t} role="tab" aria-selected={tab === t} aria-pressed={tab === t} onClick={() => setTab(t)}>
                    {label}
                  </button>
                ))}
              </div>

              {tab === "mix" && <Mixer song={song} presets={info?.soundPresets ?? []} stemsCredits={info?.stemsCredits ?? 1} audio={audio} onSaved={opened} />}
              {tab === "remix" &&
                (info?.available === false ? (
                  <div className="status">Remixing isn&apos;t set up on this server yet.</div>
                ) : (
                  <RemixPanel song={song} kinds={info?.remixKinds ?? []} peaks={peaks} audio={audio} onDone={opened} />
                ))}
              {tab === "edit" && <SongEditor song={song} peaks={peaks} audio={audio} onDone={opened} />}

              {song.contentCredentials && (
                <p className="muted cc">
                  <span className="cc-badge">cr</span> Content Credentials: marked as AI-generated
                </p>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
