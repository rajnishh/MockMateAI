"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicSongCard } from "@/lib/listen";
import * as Q from "@/lib/listen-queue";
import s from "./listen.module.css";

type Track = PublicSongCard & Q.QueueTrack;
type Home = {
  newThisWeek: number;
  new: PublicSongCard[];
  trending: PublicSongCard[];
  bestOf: { genre: string; label: string; songs: PublicSongCard[] }[];
  languages: { code: string; name: string; native: string; count: number }[];
};

const track = (c: PublicSongCard): Track => ({ ...c, key: `s:${c.publicId}` });
const AUTOPLAY_KEY = "rk-autoplay";

function readAutoplay(): boolean {
  try {
    return localStorage.getItem(AUTOPLAY_KEY) !== "off";
  } catch {
    return true;
  }
}

// The web Listen screen. Tapping a song plays it and queues the rest of its row; when the queue
// runs low, Autoplay adds related songs (same style, language or mood) not heard this session.
export function ListenClient() {
  const [lang, setLang] = useState<string | null>(null);
  const [home, setHome] = useState<Home | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<Q.Queue<Track>>(Q.emptyQueue());
  const [autoplay, setAutoplay] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [panel, setPanel] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const counted = useRef<string | null>(null);
  const fetching = useRef(false);
  const now = Q.current(queue);

  useEffect(() => setAutoplay(readAutoplay()), []);

  useEffect(() => {
    setHome(null);
    fetch(`/api/listen${lang ? `?lang=${encodeURIComponent(lang)}` : ""}`)
      .then(async (r) => (r.ok ? setHome(await r.json()) : setError("We couldn't load Listen. Try again.")))
      .catch(() => setError("We couldn't load Listen. Check your connection."));
  }, [lang]);

  // A new current song: load and play it.
  useEffect(() => {
    const a = audio.current;
    if (!a || !now) return;
    if (a.dataset.key !== now.key) {
      a.dataset.key = now.key;
      a.src = now.audioUrl;
      a.play().catch(() => setPlaying(false));
    }
  }, [now]);

  // Autoplay tops up the queue when one song is left.
  useEffect(() => {
    if (!Q.needsMore(queue, autoplay) || fetching.current) return;
    fetching.current = true;
    const params = new URLSearchParams({ exclude: Q.excludeIds(queue).join(",") });
    const seed = Q.seedId(queue);
    if (seed) params.set("seed", seed);
    fetch(`/api/listen/related?${params}`)
      .then((r) => (r.ok ? r.json() : { songs: [] }))
      .then((b: { songs: PublicSongCard[] }) => setQueue((q) => Q.appendAuto(q, b.songs.map(track))))
      .catch(() => undefined)
      .finally(() => (fetching.current = false));
  }, [queue, autoplay]);

  const toggleAutoplay = (on: boolean) => {
    setAutoplay(on);
    if (!on) setQueue(Q.dropAuto);
    try {
      localStorage.setItem(AUTOPLAY_KEY, on ? "on" : "off");
    } catch {}
  };

  const playRow = useCallback((row: PublicSongCard[], i: number) => setQueue((q) => Q.playList(q, row.map(track), i)), []);

  function toggle() {
    const a = audio.current;
    if (!a || !now) return;
    if (a.paused) a.play().catch(() => undefined);
    else a.pause();
  }

  function back() {
    const a = audio.current;
    const r = Q.previous(queue, a?.currentTime ?? 0);
    if (r.restart && a) a.currentTime = 0;
    else setQueue(r.queue);
  }

  const rows: { title: string; songs: PublicSongCard[]; ranked?: boolean }[] = home
    ? [
        { title: "New", songs: home.new },
        { title: "Trending this week", songs: home.trending, ranked: true },
        ...home.bestOf.map((b) => ({ title: `Best of ${b.label}`, songs: b.songs })),
      ].filter((r) => r.songs.length)
    : [];

  return (
    <div className={s.page}>
      <section className={s.hero}>
        <div>
          <h1>Listen</h1>
          <p>{home ? `${home.newThisWeek} new ${home.newThisWeek === 1 ? "song" : "songs"} from creators this week` : "Songs from Reelkar creators"}</p>
        </div>
        <button type="button" onClick={() => home && playRow([...home.new, ...home.trending].filter((c, i, a) => a.findIndex((x) => x.publicId === c.publicId) === i), 0)} disabled={!home?.new.length}>
          ▶ Play all
        </button>
      </section>

      {home?.languages.length ? (
        <div className={s.chips} role="group" aria-label="Language">
          <button type="button" className={s.chip} aria-pressed={lang === null} onClick={() => setLang(null)}>
            All
          </button>
          {home.languages.map((l) => (
            <button key={l.code} type="button" className={s.chip} aria-pressed={lang === l.code} onClick={() => setLang(l.code)} lang={l.code}>
              {l.native}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <p role="alert">{error}</p> : null}
      {home && !rows.length ? (
        <div className={s.empty}>
          <h2>No public songs yet</h2>
          <p>Publish one of yours from Songs, and it shows up here for everyone.</p>
          <a href="/songs">Go to Songs</a>
        </div>
      ) : null}

      {rows.map((row) => (
        <section key={row.title} className={s.section}>
          <h2>{row.title}</h2>
          <div className={s.rail}>
            {row.songs.map((c, i) => (
              <button key={c.publicId} type="button" className={`${s.tile} ${now?.publicId === c.publicId ? s.playing : ""}`} onClick={() => playRow(row.songs, i)} aria-label={`Play ${c.title} by @${c.handle}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- per-song art straight from the API */}
                {c.coverUrl ? <img className={s.art} src={c.coverUrl} alt="" /> : <span className={s.art} aria-hidden="true" />}
                {row.ranked ? <span className={s.rank}>{i + 1}</span> : null}
                <span className={s.tileTitle} dir="auto">
                  {c.title}
                </span>
                <span className={s.tileMeta}>
                  @{c.handle} · {c.languageLabel}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}

      <audio
        ref={audio}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setQueue(Q.next)}
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          setProgress(a.duration ? a.currentTime / a.duration : 0);
          if (now && a.currentTime >= 10 && counted.current !== now.key) {
            counted.current = now.key;
            fetch(`/api/listen/songs/${now.publicId}/play`, { method: "POST" }).catch(() => undefined);
          }
        }}
      />

      {now ? (
        <div className={s.bar}>
          <span className={s.progress} style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element -- per-song art straight from the API */}
          {now.coverUrl ? <img className={s.barArt} src={now.coverUrl} alt="" /> : <span className={s.barArt} aria-hidden="true" />}
          <div className={s.barText}>
            <a href={`/s/${now.publicId}`} dir="auto">
              {now.title}
            </a>
            <span>
              @{now.handle} · {now.genreLabel}
            </span>
          </div>
          <button type="button" className={s.ctl} onClick={back} aria-label="Previous">
            ⏮
          </button>
          <button type="button" className={`${s.ctl} ${s.ctlMain}`} onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
            {playing ? "❚❚" : "▶"}
          </button>
          <button type="button" className={s.ctl} onClick={() => setQueue(Q.next)} disabled={!Q.upNext(queue).length} aria-label="Next">
            ⏭
          </button>
          <button type="button" className={s.ctl} onClick={() => setPanel(!panel)} aria-expanded={panel} aria-label="Up next">
            ☰
          </button>
        </div>
      ) : null}

      {panel && now ? <UpNext queue={queue} setQueue={setQueue} autoplay={autoplay} setAutoplay={toggleAutoplay} close={() => setPanel(false)} /> : null}
    </div>
  );
}

function UpNext({
  queue,
  setQueue,
  autoplay,
  setAutoplay,
  close,
}: {
  queue: Q.Queue<Track>;
  setQueue: (f: (q: Q.Queue<Track>) => Q.Queue<Track>) => void;
  autoplay: boolean;
  setAutoplay: (on: boolean) => void;
  close: () => void;
}) {
  const now = Q.current(queue);
  const next = Q.upNext(queue);
  const mine = next.filter((t) => !t.auto);
  const auto = next.filter((t) => t.auto);
  const row = (t: Track, removable: boolean) => (
    <div key={t.key} className={s.qrow}>
      {/* eslint-disable-next-line @next/next/no-img-element -- per-song art straight from the API */}
      {t.coverUrl ? <img src={t.coverUrl} alt="" /> : <span className={s.qart} aria-hidden="true" />}
      <button type="button" className="plain" onClick={() => setQueue((q) => Q.skipTo(q, q.items.findIndex((x) => x.key === t.key)))}>
        <span dir="auto">{t.title}</span>
        <small>@{t.handle}</small>
      </button>
      {removable ? (
        <button type="button" className="ghost" onClick={() => setQueue((q) => Q.remove(q, t.key))} aria-label={`Remove ${t.title}`}>
          ✕
        </button>
      ) : null}
    </div>
  );
  return (
    <aside className={s.panel} aria-label="Up next">
      <div className="row" style={{ alignItems: "center" }}>
        <h2>Up next</h2>
        <button type="button" className="ghost" onClick={close}>
          Close
        </button>
      </div>
      <h3>Now playing</h3>
      {now ? row(now, false) : null}
      <div className="row" style={{ alignItems: "center" }}>
        <h3>Next up</h3>
        {next.length ? (
          <button type="button" className="ghost" onClick={() => setQueue(Q.clear)}>
            Clear
          </button>
        ) : null}
      </div>
      {mine.length ? mine.map((t) => row(t, true)) : <p className={s.tileMeta}>Nothing queued.</p>}
      <label className={s.switch}>
        <input type="checkbox" checked={autoplay} onChange={(e) => setAutoplay(e.target.checked)} />
        <span>
          <strong>Keep the music going</strong>
          When your queue ends, we&apos;ll play songs like these: same style, language or mood.
        </span>
      </label>
      {autoplay && auto.length ? (
        <>
          <h3>Autoplay</h3>
          {auto.map((t) => row(t, true))}
        </>
      ) : null}
    </aside>
  );
}
