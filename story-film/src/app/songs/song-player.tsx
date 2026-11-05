"use client";

import { createPortal } from "react-dom";
import { type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { SongAnalysis } from "@/lib/songs/analysis";
import { activeLine, beatPulse, PLAYER_THEMES, type PlayerTheme, themeById } from "@/lib/songs/player-themes";
import s from "./song-player.module.css";

export type PlayerSong = { id: string; title: string; genre: string; audioUrl: string | null; durationSec: number; coverUrl?: string | null };

const PLAY_EVENT = "reelkar:song-play";
const THEME_KEY = "reelkar.playerTheme";
const ENVELOPE_RATE = 20;

// Analyses are worked out once on the server; each page load asks at most once per song.
const analyses = new Map<string, Promise<SongAnalysis | null>>();
function loadAnalysis(id: string): Promise<SongAnalysis | null> {
  let job = analyses.get(id);
  if (!job) {
    job = fetch(`/api/songs/${id}/analysis`).then((r) => (r.ok ? (r.json() as Promise<SongAnalysis>) : null)).catch(() => null);
    analyses.set(id, job);
    job.then((a) => !a && analyses.delete(id));
  }
  return job;
}

function readTheme(): PlayerTheme {
  try {
    return themeById(localStorage.getItem(THEME_KEY));
  } catch {
    return PLAYER_THEMES[0];
  }
}

const fmt = (sec: number) => {
  const t = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

// A song's player: cover to tap, a waveform to scrub, and a full-screen stage with sparkle dust and lyrics in time.
export function SongPlayer({ song, genreLabel }: { song: PlayerSong; genreLabel?: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(song.durationSec);
  const [analysis, setAnalysis] = useState<SongAnalysis | null>(null);
  const [open, setOpen] = useState(false);
  const [theme, setThemeState] = useState<PlayerTheme>(PLAYER_THEMES[0]);

  useEffect(() => setThemeState(readTheme()), []);

  // Only one song plays at a time on the page.
  useEffect(() => {
    const other = (e: Event) => (e as CustomEvent<string>).detail !== song.id && audio.current?.pause();
    window.addEventListener(PLAY_EVENT, other);
    return () => window.removeEventListener(PLAY_EVENT, other);
  }, [song.id]);

  const wantAnalysis = useCallback(() => {
    if (!analysis) loadAnalysis(song.id).then((a) => a && setAnalysis(a));
  }, [analysis, song.id]);

  function toggle() {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      wantAnalysis();
      a.play().catch(() => undefined);
    } else a.pause();
  }
  const seek = (sec: number) => {
    const a = audio.current;
    if (!a) return;
    a.currentTime = Math.min(Math.max(0, sec), Math.max(0, (a.duration || duration) - 0.25));
    setTime(a.currentTime);
  };
  function openStage() {
    wantAnalysis();
    setOpen(true);
    if (audio.current?.paused) toggle();
  }
  function pickTheme(t: PlayerTheme) {
    setThemeState(t);
    try {
      localStorage.setItem(THEME_KEY, t.id);
    } catch {
      // Storage can be blocked; the pick still holds for this visit.
    }
  }

  if (!song.audioUrl) return null;
  return (
    <div className={s.player} style={{ "--accent": theme.accent } as CSSProperties}>
      <audio
        ref={audio}
        src={song.audioUrl}
        preload="metadata"
        onPlay={() => {
          setPlaying(true);
          window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: song.id }));
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
      />
      <button type="button" className={s.coverBtn} onClick={toggle} aria-label={playing ? `Pause ${song.title}` : `Play ${song.title}`}>
        <Cover song={song} />
        <span className={s.coverPlay} data-on={playing}>{playing ? <PauseIcon /> : <PlayIcon />}</span>
      </button>
      <div className={s.rowMid}>
        <Waveform peaks={analysis?.peaks ?? null} time={time} duration={duration} onSeek={seek} label={song.title} />
        <div className={s.times}>
          <span>{fmt(time)}</span>
          <span>{analysis?.bpm ? `${analysis.bpm} BPM · ` : ""}{fmt(duration)}</span>
        </div>
      </div>
      <button type="button" className={`secondary ${s.openBtn}`} onClick={openStage} aria-label={`Open the full player for ${song.title}`}>
        ⤢ Player
      </button>
      {open && (
        <Stage
          song={song}
          genreLabel={genreLabel}
          audio={audio}
          analysis={analysis}
          theme={theme}
          onTheme={pickTheme}
          playing={playing}
          time={time}
          duration={duration}
          onToggle={toggle}
          onSeek={seek}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function hash(t: string): number {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return h >>> 0;
}
const PAIRS = [
  ["#ffb21a", "#ff4d2e"],
  ["#14d9a0", "#0a7a58"],
  ["#ff7a1a", "#5b1f4f"],
  ["#ffc23d", "#ff7a1a"],
  ["#ff5a3c", "#2e1a36"],
  ["#2bf0b5", "#2a1235"],
];

// The AI cover when there is one, else a gradient made from the song id.
function Cover({ song, big }: { song: PlayerSong; big?: boolean }) {
  const [failed, setFailed] = useState(false);
  const cls = big ? `${s.cover} ${s.coverBig}` : s.cover;
  if (song.coverUrl && !failed) {
    return <img className={cls} src={song.coverUrl} alt="" onError={() => setFailed(true)} />;
  }
  const h = hash(song.id);
  const [a, b] = PAIRS[h % PAIRS.length];
  const style = {
    background: `radial-gradient(circle at ${20 + ((h >> 4) % 60)}% ${20 + ((h >> 10) % 50)}%, rgba(255,247,238,.5), transparent 55%), linear-gradient(${(h >> 6) % 360}deg, ${a}, ${b})`,
  };
  return (
    <span className={cls} style={style} aria-hidden>
      <span className={s.coverLetter}>{(song.title.trim()[0] ?? "♪").toUpperCase()}</span>
    </span>
  );
}

// Waveform bars on a canvas, with a slider for keyboards and screen readers.
function Waveform({ peaks, time, duration, onSeek, label, tall }: { peaks: number[] | null; time: number; duration: number; onSeek: (s: number) => void; label: string; tall?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? (duration ? time / duration : 0);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = w * dpr;
    c.height = h * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const n = Math.max(24, Math.floor(w / 5));
    const css = getComputedStyle(c);
    const on = css.getPropertyValue("--wave-on").trim() || "#ff7a1a";
    const off = css.getPropertyValue("--wave-off").trim() || "rgba(128,128,128,.3)";
    for (let i = 0; i < n; i++) {
      let v = 0.25 + 0.2 * Math.abs(Math.sin(i * 0.5));
      if (peaks?.length) {
        const from = Math.floor((i * peaks.length) / n);
        const to = Math.max(from + 1, Math.floor(((i + 1) * peaks.length) / n));
        v = 0;
        for (let j = from; j < to; j++) v = Math.max(v, peaks[j] ?? 0);
      }
      const bh = Math.max(3, (0.18 + v * 0.82) * h);
      ctx.fillStyle = i / n < shown ? on : off;
      ctx.beginPath();
      ctx.roundRect(i * (w / n), (h - bh) / 2, w / n - 2, bh, 2);
      ctx.fill();
    }
  }, [peaks, shown, tall]);

  const at = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };
  const key = (e: KeyboardEvent) => {
    const step = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5, PageUp: 10, PageDown: -10 }[e.key];
    if (step) {
      e.preventDefault();
      onSeek(time + step);
    } else if (e.key === "Home") onSeek(0);
    else if (e.key === "End") onSeek(duration);
  };
  return (
    <canvas
      ref={canvas}
      className={tall ? `${s.wave} ${s.waveTall}` : s.wave}
      role="slider"
      tabIndex={0}
      aria-label={`Position in ${label}`}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(shown * duration)}
      aria-valuetext={`${fmt(shown * duration)} of ${fmt(duration)}`}
      onKeyDown={key}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(at(e));
      }}
      onPointerMove={(e) => drag !== null && setDrag(at(e))}
      onPointerUp={(e) => {
        onSeek(at(e) * duration);
        setDrag(null);
      }}
      onPointerCancel={() => setDrag(null)}
    />
  );
}

interface StageProps {
  song: PlayerSong;
  genreLabel?: string;
  audio: RefObject<HTMLAudioElement | null>;
  analysis: SongAnalysis | null;
  theme: PlayerTheme;
  onTheme: (t: PlayerTheme) => void;
  playing: boolean;
  time: number;
  duration: number;
  onToggle: () => void;
  onSeek: (s: number) => void;
  onClose: () => void;
}

// Full-screen player: themed sky, sparkle dust on the beat, big cover, lyrics in time.
function Stage({ song, genreLabel, audio, analysis, theme, onTheme, playing, time, duration, onToggle, onSeek, onClose }: StageProps) {
  const sky = useRef<HTMLCanvasElement>(null);
  const cover = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const lyricsBox = useRef<HTMLDivElement>(null);
  useDust(sky, cover, audio, analysis, theme, playing);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const esc = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = overflow;
      before?.focus();
    };
  }, [onClose]);

  const lines = analysis?.lines ?? [];
  const active = activeLine(lines, time);
  useEffect(() => {
    const box = lyricsBox.current;
    if (!box) return;
    if (active < 0) return box.scrollTo({ top: 0, behavior: "smooth" });
    const el = box.querySelector<HTMLElement>(`[data-line="${active}"]`);
    if (el) box.scrollTo({ top: el.offsetTop - box.clientHeight * 0.32, behavior: "smooth" });
  }, [active]);

  // On <body>, so no card's transform or overflow can trap the full-screen stage.
  return createPortal(
    <div className={s.stage} role="dialog" aria-modal="true" aria-label={`Now playing: ${song.title}`} style={{ background: theme.sky[2], "--accent": theme.accent, "--on-accent": theme.onAccent } as CSSProperties}>
      <canvas ref={sky} className={s.sky} aria-hidden />
      <div className={s.stageInner}>
        <div className={s.stageTop}>
          <button ref={close} type="button" className={s.iconBtn} onClick={onClose} aria-label="Close player">✕</button>
          <div className={s.nowPlaying}>
            <span>Now playing</span>
            <small>{[genreLabel, analysis?.bpm ? `${analysis.bpm} BPM` : null].filter(Boolean).join(" · ")}</small>
          </div>
          <a className={s.iconBtn} href={song.audioUrl ?? undefined} download aria-label="Download song">⤓</a>
        </div>
        <div ref={cover} className={s.coverWrap}>
          <Cover song={song} big />
        </div>
        <h2 className={s.stageTitle}>{song.title}</h2>
        <div ref={lyricsBox} className={s.lyrics}>
          {lines.length ? (
            lines.map((l, i) => (
              <button type="button" key={i} data-line={i} className={s.line} data-state={i === active ? "now" : i < active ? "past" : "next"} onClick={() => onSeek(l.start)}>
                {l.text}
              </button>
            ))
          ) : (
            <p className={s.line}>{analysis ? "Instrumental" : ""}</p>
          )}
        </div>
        <Waveform peaks={analysis?.peaks ?? null} time={time} duration={duration} onSeek={onSeek} label={song.title} tall />
        <div className={s.times}>
          <span>{fmt(time)}</span>
          <span>{fmt(duration)}</span>
        </div>
        <div className={s.controls}>
          <button type="button" className={s.iconBtn} onClick={() => onSeek(time - 10)} aria-label="Back 10 seconds">↺ 10</button>
          <button type="button" className={s.bigPlay} onClick={onToggle} aria-label={playing ? "Pause" : "Play"}>{playing ? <PauseIcon /> : <PlayIcon />}</button>
          <button type="button" className={s.iconBtn} onClick={() => onSeek(time + 10)} aria-label="Forward 10 seconds">10 ↻</button>
        </div>
        <div className={s.themes} role="radiogroup" aria-label="Player theme">
          {PLAYER_THEMES.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={t.id === theme.id} className={s.theme} onClick={() => onTheme(t)} title={t.hint}>
              <span className={s.swatch} style={{ background: `radial-gradient(circle, ${t.glow} 0 30%, ${t.sky[0]} 32%)` }} />
              {t.name}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// A soft glowing dot, drawn once per colour and stamped for every particle.
function sprite(color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, color);
  grad.addColorStop(0.18, color);
  grad.addColorStop(0.32, `${color}55`);
  grad.addColorStop(1, `${color}00`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

const seeded = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// Draws the themed sky and the beat-driven dust. Runs only while the song plays and the tab is visible;
// with Reduce Motion it draws the sky once and no dust.
function useDust(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  coverRef: RefObject<HTMLDivElement | null>,
  audioRef: RefObject<HTMLAudioElement | null>,
  analysis: SongAnalysis | null,
  theme: PlayerTheme,
  playing: boolean,
) {
  const travel = useRef(0);
  const clock = useRef(0);
  const energy = useRef(0);
  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const sprites = theme.particles.map(sprite);
    const seeds = Array.from({ length: theme.count }, (_, i) => ({
      x0: seeded(i, 1),
      y0: seeded(i, 2),
      speed: 0.35 + seeded(i, 3) * 0.9,
      phase: seeded(i, 4) * Math.PI * 2,
      burst: 0.4 + seeded(i, 5) * 1.2,
      size: 1.6 + seeded(i, 6) * 3.4,
      spin: 0.7 + seeded(i, 7) * 2,
      sprite: sprites[i % sprites.length],
      color: theme.particles[i % theme.particles.length],
    }));
    let w = 0;
    let h = 0;
    const resize = () => {
      w = c.clientWidth;
      h = c.clientHeight;
      c.width = w * dpr;
      c.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let last = performance.now();
    const frac = (v: number) => v - Math.floor(v);
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = audioRef.current?.currentTime ?? 0;
      const env = analysis?.envelope ?? [];
      let loud = 0.55;
      if (env.length) {
        const x = t * ENVELOPE_RATE;
        const i = Math.floor(x);
        loud = i >= 0 && i < env.length ? env[i] + ((env[i + 1] ?? env[i]) - env[i]) * (x - i) : 0;
      }
      const pulse = playing ? (analysis?.beats.length ? beatPulse(analysis.beats, analysis.strength, t) : env.length ? 0 : 0.6 * Math.exp(-((t * 1.6) % 1) * 5)) : 0;
      energy.current += ((playing ? loud : 0) - energy.current) * Math.min(1, dt * 10);
      const e = energy.current;
      if (playing) {
        travel.current += dt * (0.18 + e * 0.9 + pulse * 1.6);
        clock.current += dt;
      }

      const cr = coverRef.current?.getBoundingClientRect();
      const cx = cr ? cr.left + cr.width / 2 : w / 2;
      const cy = cr ? cr.top + cr.height / 2 : h * 0.35;
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, theme.sky[0]);
      sky.addColorStop(0.55, theme.sky[1]);
      sky.addColorStop(1, theme.sky[2]);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      const r = Math.min(w, h) * 0.5 * (1 + e * 0.12 + pulse * 0.14);
      const aura = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      aura.addColorStop(0, `${theme.glow}${reduce ? "66" : Math.round(0x40 + e * 0x50 + pulse * 0x30).toString(16).padStart(2, "0")}`);
      aura.addColorStop(1, `${theme.glow}00`);
      ctx.fillStyle = aura;
      ctx.fillRect(0, 0, w, h);
      if (reduce) return;

      ctx.globalCompositeOperation = "lighter";
      const travelled = travel.current;
      const clk = clock.current;
      for (const p of seeds) {
        let x: number;
        let y: number;
        let fade = 1;
        if (theme.kind === "rise") {
          y = h + 20 - frac(p.y0 + travelled * p.speed * 0.35) * (h + 40);
          x = p.x0 * w + Math.sin(clk * 0.6 + p.phase) * 14;
        } else if (theme.kind === "rain") {
          y = -30 + frac(p.y0 + travelled * p.speed * 1.1) * (h + 60);
          x = frac(p.x0 + 0.3 - (y / w) * 0.25) * w;
        } else if (theme.kind === "radiate") {
          const d = frac(p.y0 + travelled * p.speed * 0.3);
          const rad = d * Math.hypot(w, h) * 0.55;
          const a = p.x0 * Math.PI * 2 + clk * 0.05 * (p.phase > Math.PI ? 1 : -1);
          x = cx + Math.cos(a) * rad;
          y = cy + Math.sin(a) * rad;
          fade = Math.min(1, d * 5);
        } else {
          y = -20 + frac(p.y0 + travelled * p.speed * 0.25) * (h + 40);
          x = p.x0 * w + Math.sin(clk * 0.8 + p.phase) * 24;
        }
        x += (x - cx) * pulse * p.burst * 0.16;
        y += (y - cy) * pulse * p.burst * 0.16;
        const twinkle = 0.25 + 0.55 * Math.abs(Math.sin(clk * (1.2 + p.burst) + p.phase));
        ctx.globalAlpha = Math.min(1, (twinkle + pulse * 0.35) * fade);
        const scale = 1 + pulse * (0.7 + p.burst * 0.6) + e * 0.35;
        if (theme.kind === "rain") {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = (p.size / 2.2) * scale;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - 4, y + 10 + p.size * 5);
          ctx.stroke();
        } else if (theme.kind === "tumble") {
          const sz = p.size * 1.3 * scale;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(clk * p.spin + p.y0 * 6);
          ctx.drawImage(p.sprite, -sz * 2, -sz * 2, sz * 4, sz * 4);
          ctx.fillStyle = p.color;
          ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
          ctx.restore();
        } else {
          const sz = p.size * 7 * scale;
          ctx.drawImage(p.sprite, x - sz / 2, y - sz / 2, sz, sz);
        }
      }
      if (playing && !document.hidden) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const wake = () => {
      if (!document.hidden && playing) {
        last = performance.now();
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", wake);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [canvasRef, coverRef, audioRef, analysis, theme, playing]);
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden>
      <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.4-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" fill="currentColor" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden>
      <rect x="5" y="4" width="5" height="16" rx="1.5" fill="currentColor" />
      <rect x="14" y="4" width="5" height="16" rx="1.5" fill="currentColor" />
    </svg>
  );
}
