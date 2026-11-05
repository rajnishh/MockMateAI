"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { copy as giftCopy, type PageLang } from "@/app/g/[token]/copy";
import { Report } from "@/app/g/[token]/gift-page";
import g from "@/app/g/[token]/gift.module.css";
import type { PublicSongCard, PublicSongView, Reaction } from "@/lib/listen";
import { ReelLogo } from "../../reel-logo";
import { REACTION_EMOJI, songCopy } from "./copy";
import s from "./song.module.css";

const REACTIONS = Object.keys(REACTION_EMOJI) as Reaction[];
const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const iso = (name: string) => `⁨${name}⁩`;

function send(url: string, method: "POST" | "PUT", body?: unknown) {
  return fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), keepalive: true });
}

// A public song: play, lyrics, likes and reactions, two rails, and Report. When the song ends,
// the first "More like this" song plays after a short countdown, so the music keeps going.
export function SongPage({ view, rails, lang, signedIn, url }: { view: PublicSongView; rails: { moreLikeThis: PublicSongCard[]; byCreator: PublicSongCard[] }; lang: PageLang; signedIn: boolean; url: string }) {
  const t = songCopy(lang);
  const gt = giftCopy(lang);
  const router = useRouter();
  const dir = lang === "ar" ? "rtl" : "ltr";
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(view.durationSec);
  const [failed, setFailed] = useState(false);
  const [vote, setVote] = useState(view.myVote);
  const [likes, setLikes] = useState(view.likeCount);
  const [reaction, setReaction] = useState<Reaction | null>(view.myReaction);
  const [reporting, setReporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const counted = useRef(false);
  const next = rails.moreLikeThis[0];
  const login = `/login?next=${encodeURIComponent(`/s/${view.publicId}`)}`;

  // "Next song in 5 s" after the song ends.
  useEffect(() => {
    if (countdown === null || !next) return;
    if (countdown <= 0) {
      router.push(`/s/${next.publicId}?autoplay=1`);
      return;
    }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, next, router]);

  // Arriving from a countdown: try to play right away (browsers allow it after the earlier tap).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("autoplay") === "1") audio.current?.play().catch(() => undefined);
  }, []);

  if (view.state !== "public") {
    return (
      <Shell lang={lang} dir={dir} onReport={() => setReporting(true)} reporting={reporting} closeReport={() => setReporting(false)} publicId={view.publicId} t={t} gt={gt}>
        <section className={`${g.hero} ${g.center}`}>
          <p className={g.headline}>{view.state === "taken_down" ? t.takenDown : t.private}</p>
          <a className={g.ghostBtn} href="/songs">
            {t.makeOwn}
          </a>
        </section>
      </Shell>
    );
  }

  function toggle() {
    const a = audio.current;
    if (!a) return;
    setCountdown(null);
    if (a.paused) a.play().catch(() => setFailed(true));
    else a.pause();
  }

  async function doVote(value: 1 | -1) {
    const nextVote = vote === value ? 0 : value;
    setLikes(likes + (nextVote === 1 ? 1 : 0) - (vote === 1 ? 1 : 0));
    setVote(nextVote);
    await send(`/api/listen/songs/${view.publicId}/vote`, "PUT", { value: nextVote }).catch(() => undefined);
  }

  async function doReact(kind: Reaction) {
    const nextKind = reaction === kind ? null : kind;
    setReaction(nextKind);
    await send(`/api/listen/songs/${view.publicId}/reaction`, "PUT", { kind: nextKind }).catch(() => undefined);
  }

  async function share() {
    const text = `${view.title} · @${view.handle}`;
    if (navigator.share) return navigator.share({ title: text, url }).catch(() => undefined);
    await navigator.clipboard?.writeText(url);
    setToast(t.copied);
    setTimeout(() => setToast(null), 2000);
  }

  return (
    <Shell lang={lang} dir={dir} onReport={() => setReporting(true)} reporting={reporting} closeReport={() => setReporting(false)} publicId={view.publicId} t={t} gt={gt}>
      <audio
        ref={audio}
        src={view.audioUrl}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          if (next) setCountdown(5);
        }}
        onTimeUpdate={(e) => {
          const now = e.currentTarget.currentTime;
          setTime(now);
          // A play counts after 10 seconds; the server keeps it to one per listener per day.
          if (now >= 10 && !counted.current) {
            counted.current = true;
            send(`/api/listen/songs/${view.publicId}/play`, "POST").catch(() => undefined);
          }
        }}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onError={() => setFailed(true)}
      />
      <section className={g.opened}>
        {/* eslint-disable-next-line @next/next/no-img-element -- per-song art straight from the API */}
        {view.coverUrl ? <img className={g.cover} src={view.coverUrl} alt="" /> : <div className={`${g.cover} ${g.coverFallback}`} aria-hidden="true" />}
        <h1 className={g.title} dir="auto">
          {view.title}
        </h1>
        <p className={s.handle}>@{view.handle}</p>
        <p className={g.meta}>
          {view.genreLabel} · {view.languageLabel} · {t.plays(view.playCount)} · <span dir="ltr">{fmt(duration)}</span>
        </p>
        {view.ownVoice ? <span className={g.voicePill}>{t.ownVoice(view.handle)}</span> : null}
        {view.remixOf ? (
          <a className={g.replyBanner} href={`/s/${view.remixOf.publicId}`}>
            {t.remixOf(iso(view.remixOf.title), view.remixOf.handle)}
          </a>
        ) : null}
        <div className={g.player} dir="ltr">
          <button type="button" className={g.play} onClick={toggle} aria-label={playing ? t.pause : t.play}>
            {playing ? "❚❚" : "▶"}
          </button>
          <input
            className={g.scrub}
            type="range"
            min={0}
            max={Math.max(1, Math.round(duration))}
            step={1}
            value={Math.round(time)}
            onChange={(e) => {
              if (audio.current) audio.current.currentTime = Number(e.target.value);
              setTime(Number(e.target.value));
            }}
            aria-label={view.title}
            aria-valuetext={`${fmt(time)} / ${fmt(duration)}`}
          />
          <span className={g.time}>
            {fmt(time)} / {fmt(duration)}
          </span>
        </div>
        {failed ? (
          <div className={g.error} role="alert">
            {gt.audioFailed}
          </div>
        ) : null}
        {countdown !== null && next ? (
          <div className={s.countdown} role="status">
            <span>
              {t.next(countdown)}: <strong dir="auto">{next.title}</strong>
            </span>
            <button type="button" className={g.linkBtn} onClick={() => setCountdown(null)}>
              {t.cancel}
            </button>
          </div>
        ) : null}

        {view.mine ? (
          <p className={g.meta}>
            {t.yours} · {t.likes(likes)}
          </p>
        ) : (
          <>
            <div className={s.actions}>
              {signedIn ? (
                <>
                  <button type="button" className={s.pill} aria-pressed={vote === 1} onClick={() => doVote(1)}>
                    ♥ {t.like} · {likes}
                  </button>
                  <button type="button" className={s.pill} aria-pressed={vote === -1} onClick={() => doVote(-1)}>
                    {t.notForMe}
                  </button>
                </>
              ) : (
                <a className={s.pill} href={login}>
                  ♥ {t.likes(likes)} · {t.signInToReact}
                </a>
              )}
              <button type="button" className={s.pill} onClick={share}>
                {t.share}
              </button>
            </div>
            <div className={s.reactions} role="group" aria-label="Reactions">
              {REACTIONS.map((k) => {
                // Counts come from the server only once a reaction has 3.
                const n = view.reactions[k];
                return signedIn ? (
                  <button key={k} type="button" className={s.reaction} aria-pressed={reaction === k} aria-label={k} onClick={() => doReact(k)}>
                    {REACTION_EMOJI[k]}
                    {n ? <span className={s.count}>{n}</span> : null}
                  </button>
                ) : (
                  <a key={k} className={s.reaction} href={login} aria-label={k}>
                    {REACTION_EMOJI[k]}
                    {n ? <span className={s.count}>{n}</span> : null}
                  </a>
                );
              })}
            </div>
          </>
        )}

        {view.lyrics ? (
          <div className={s.section}>
            <h2>{t.lyrics}</h2>
            <p className={s.plainLyrics} dir="auto">
              {view.lyrics.replace(/^\[[^\]]+\]\s*$/gm, "").replace(/\n{3,}/g, "\n\n").trim()}
            </p>
          </div>
        ) : null}
        <Rail title={t.more} songs={rails.moreLikeThis} />
        <Rail title={t.byCreator(view.handle)} songs={rails.byCreator} />
      </section>
      <div className={g.cta}>
        <a className={g.replyBtn} href="/songs">
          {t.makeOwn}
        </a>
      </div>
      {toast ? (
        <div className={s.toast} role="status">
          {toast}
        </div>
      ) : null}
    </Shell>
  );
}

function Rail({ title, songs }: { title: string; songs: PublicSongCard[] }) {
  if (!songs.length) return null;
  return (
    <div className={s.section}>
      <h2>{title}</h2>
      <div className={s.rail}>
        {songs.map((c) => (
          <a key={c.publicId} className={s.tile} href={`/s/${c.publicId}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- per-song art straight from the API */}
            {c.coverUrl ? <img src={c.coverUrl} alt="" /> : <span className={s.tileArt} aria-hidden="true" />}
            <span className={s.tileTitle} dir="auto">
              {c.title}
            </span>
            <span className={s.tileMeta}>
              @{c.handle} · {c.languageLabel}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

function Shell({
  lang,
  dir,
  children,
  onReport,
  reporting,
  closeReport,
  publicId,
  t,
  gt,
}: {
  lang: PageLang;
  dir: "rtl" | "ltr";
  children: React.ReactNode;
  onReport: () => void;
  reporting: boolean;
  closeReport: () => void;
  publicId: string;
  t: ReturnType<typeof songCopy>;
  gt: ReturnType<typeof giftCopy>;
}) {
  return (
    <div className={g.page} lang={lang} dir={dir}>
      <header className={g.top}>
        <a className={g.brand} href="/listen" style={{ color: "inherit", textDecoration: "none" }}>
          <ReelLogo size={26} />
          Reelkar
        </a>
        <span className={g.aiPill}>{gt.madeWithAi}</span>
      </header>
      <main className={g.main}>{children}</main>
      <footer className={g.foot}>
        <span>{gt.madeWithAi} · Reelkar</span>
        <button type="button" className={g.linkBtn} onClick={onReport}>
          ⚑ {gt.report}
        </button>
      </footer>
      {reporting ? <Report endpoint={`/api/listen/songs/${publicId}/report`} lang={lang} title={t.reportTitle} onClose={closeReport} /> : null}
    </div>
  );
}
