"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import type { PublicGiftView } from "@/lib/gifts";
import { ReelLogo } from "../../reel-logo";
import { copy, occasionName, occasionTitle, type PageLang } from "./copy";
import s from "./gift.module.css";

type Line = { text: string; start: number; end: number };

// Names sit in Unicode isolates, so a Latin name in an Arabic sentence (or the reverse) keeps its place.
const iso = (name: string) => `\u2068${name}\u2069`;

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

function sendEvent(token: string, type: "open" | "play") {
  fetch(`/api/g/${token}/event`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type }), keepalive: true }).catch(() => undefined);
}

// Sealed until "Open your gift" (that tap starts the song, so no autoplay tricks), then the player,
// the lyrics as they're sung, the note, and "Reply with your own song".
export function GiftPage({ view, lang, isSender, count, url }: { view: PublicGiftView; lang: PageLang; isSender: boolean; count: boolean; url: string }) {
  const t = copy(lang, view.address);
  const dir = lang === "ar" ? "rtl" : "ltr";
  const [reporting, setReporting] = useState(false);
  const body =
    view.state === "ready" ? (
      <Ready view={view} lang={lang} isSender={isSender} count={count} url={url} />
    ) : view.state === "processing" ? (
      <Processing view={view} lang={lang} />
    ) : (
      <section className={`${s.hero} ${s.center}`}>
        <p className={s.headline}>{view.state === "taken_down" ? t.takenDown : view.state === "failed" ? t.failed : t.removed}</p>
        <a className={s.ghostBtn} href="/songs">
          {t.makeOwn}
        </a>
      </section>
    );
  return (
    <div className={s.page} lang={lang} dir={dir}>
      <header className={s.top}>
        <span className={s.brand}>
          <ReelLogo size={26} />
          Reelkar
        </span>
        <span className={s.aiPill}>{t.madeWithAi}</span>
      </header>
      <main className={s.main}>
        {view.replyTo ? (
          <a className={s.replyBanner} href={`/g/${view.replyTo.token}`}>
            {t.replyTo(occasionName(lang, view.replyTo.occasion))}
          </a>
        ) : null}
        {body}
      </main>
      <footer className={s.foot}>
        <span>{t.madeWithAi} · Reelkar</span>
        {view.state === "ready" ? <span>{t.privacy(iso(view.fromName))}</span> : null}
        <button type="button" className={s.linkBtn} onClick={() => setReporting(true)}>
          ⚑ {t.report}
        </button>
      </footer>
      {reporting ? <Report endpoint={`/api/g/${view.token}/report`} lang={lang} onClose={() => setReporting(false)} /> : null}
    </div>
  );
}

function Cover({ view, className }: { view: PublicGiftView; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- a private, per-gift picture; no optimiser in between
  return view.coverUrl ? <img className={className} src={view.coverUrl} alt="" /> : <div className={`${className} ${s.coverFallback}`} aria-hidden="true" />;
}

function Ready({ view, lang, isSender, count, url }: { view: PublicGiftView; lang: PageLang; isSender: boolean; count: boolean; url: string }) {
  const t = copy(lang, view.address);
  const audio = useRef<HTMLAudioElement>(null);
  const well = useRef<HTMLOListElement>(null);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(view.durationSec);
  const [failed, setFailed] = useState(false);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [follow, setFollow] = useState(true);
  const [showReply, setShowReply] = useState(false);
  const played = useRef(false);
  const followTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!open || lines || !view.lines.length) return;
    fetch(`/api/g/${view.token}/lyrics`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { lines: Line[] } | null) => setLines(b?.lines ?? []))
      .catch(() => setLines([]));
  }, [open, lines, view.lines.length, view.token]);

  const timed = lines && lines.length ? lines : null;
  // The last line that has started (a hair early, so the highlight lands with the voice).
  const current = timed ? timed.reduce((at, l, i) => (time >= l.start - 0.15 ? i : at), -1) : -1;

  // Keep the sung line in the upper third, unless the reader scrolled away.
  useEffect(() => {
    if (!follow || current < 0) return;
    const li = well.current?.children[current] as HTMLElement | undefined;
    const box = well.current;
    if (!li || !box) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollTo({ top: li.offsetTop - box.clientHeight / 3, behavior: reduce ? "auto" : "smooth" });
  }, [current, follow]);

  function openGift() {
    setOpen(true);
    if (count) sendEvent(view.token, "open");
    // The same tap plays the song.
    audio.current?.play().catch(() => undefined);
  }

  function toggle() {
    const a = audio.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => setFailed(true));
    else a.pause();
  }

  function retry() {
    setFailed(false);
    audio.current?.load();
    audio.current?.play().catch(() => setFailed(true));
  }

  function seek(sec: number) {
    if (audio.current) audio.current.currentTime = sec;
    setTime(sec);
  }

  function pauseFollow() {
    setFollow(false);
    clearTimeout(followTimer.current);
    followTimer.current = setTimeout(() => setFollow(true), 5000);
  }

  const shareText = encodeURIComponent(`${view.toName}, I made you a song 🎶 Open it here: ${url}`);

  return (
    <>
      <audio
        ref={audio}
        src={view.audioUrl ?? undefined}
        preload="metadata"
        onPlay={() => {
          setPlaying(true);
          if (!played.current) {
            played.current = true;
            if (count) sendEvent(view.token, "play");
          }
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setShowReply(true);
        }}
        onTimeUpdate={(e) => {
          const now = e.currentTarget.currentTime;
          setTime(now);
          if (now > 10) setShowReply(true);
        }}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onError={() => setFailed(true)}
      />
      {!open ? (
        <section className={`${s.hero} ${s.sealed}`}>
          <p className={s.overline}>{t.overline}</p>
          <h1 className={s.headline}>
            {t.headline(iso(view.toName), iso(view.fromName))}
          </h1>
          <span className={s.chip}>{occasionTitle(lang, view.occasion)}</span>
          <div className={s.box}>
            <Cover view={view} className={s.boxCover} />
            <span className={s.ribbon} aria-hidden="true" />
          </div>
          <button type="button" className={s.openBtn} onClick={openGift}>
            {t.open}
          </button>
          <p className={s.hint}>{t.sound}</p>
        </section>
      ) : (
        <section className={s.opened}>
          <Cover view={view} className={s.cover} />
          <h1 className={s.title}>{view.title}</h1>
          <p className={s.meta}>
            {t.from(iso(view.fromName))} · {occasionTitle(lang, view.occasion)} · <span dir="ltr">{fmt(duration)}</span>
          </p>
          {view.ownVoice ? <span className={s.voicePill}>{t.ownVoice(iso(view.fromName))}</span> : null}
          {/* Media controls and time run left to right in every language. */}
          <div className={s.player} dir="ltr">
            <button type="button" className={s.play} onClick={toggle} aria-label={playing ? t.pause : t.play}>
              {playing ? "❚❚" : "▶"}
            </button>
            <input
              className={s.scrub}
              type="range"
              min={0}
              max={Math.max(1, Math.round(duration))}
              step={1}
              value={Math.round(time)}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label={view.title}
              aria-valuetext={`${fmt(time)} / ${fmt(duration)}`}
            />
            <span className={s.time}>
              {fmt(time)} / {fmt(duration)}
            </span>
          </div>
          {failed ? (
            <div className={s.error} role="alert">
              {t.audioFailed}{" "}
              <button type="button" className={s.linkBtn} onClick={retry}>
                {t.tryAgain}
              </button>
            </div>
          ) : null}
          {view.lines.length ? (
            <div className={s.lyricsWrap}>
              <ol ref={well} className={s.lyrics} aria-label={t.lyrics} onWheel={pauseFollow} onTouchMove={pauseFollow}>
                {(timed ?? view.lines.map((text) => ({ text, start: -1, end: -1 }))).map((l, i) => (
                  <li key={i} aria-current={i === current ? "true" : undefined} className={i === current ? s.now : i < current ? s.past : undefined}>
                    {timed ? (
                      <button type="button" className={s.lineBtn} onClick={() => seek(l.start)}>
                        {l.text}
                      </button>
                    ) : (
                      l.text
                    )}
                  </li>
                ))}
              </ol>
              {!follow && timed ? (
                <button type="button" className={s.followBtn} onClick={() => setFollow(true)}>
                  {t.follow}
                </button>
              ) : null}
            </div>
          ) : (
            <p className={s.meta}>{t.instrumental}</p>
          )}
          {view.note ? (
            <blockquote className={s.note}>
              <span className={s.noteBy}>{t.wrote(iso(view.fromName))}</span>
              {view.note}
            </blockquote>
          ) : null}
        </section>
      )}
      {isSender ? (
        <div className={`${s.cta} ${open && showReply ? s.pinned : ""}`}>
          <a className={s.replyBtn} href={`https://wa.me/?text=${shareText}`} target="_blank" rel="noreferrer">
            Send on WhatsApp
          </a>
          <button type="button" className={s.ghostBtn} onClick={() => navigator.clipboard?.writeText(url)}>
            Copy link
          </button>
        </div>
      ) : open ? (
        <div className={`${s.cta} ${showReply ? s.pinned : ""}`}>
          <a className={s.replyBtn} href={`/g/${view.token}/reply`}>
            {t.reply}
          </a>
          <p className={s.hint}>{t.replyFree}</p>
        </div>
      ) : null}
    </>
  );
}

// "Your song is almost ready": a reply sent before its song finished. Checks again every 10 s for 5 minutes.
function Processing({ view, lang }: { view: PublicGiftView; lang: PageLang }) {
  const t = copy(lang, view.address);
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    let tries = 0;
    const timer = setInterval(() => {
      if (++tries > 30) {
        clearInterval(timer);
        setGaveUp(true);
      } else router.refresh();
    }, 10_000);
    return () => clearInterval(timer);
  }, [router]);
  return (
    <section className={`${s.hero} ${s.center}`} aria-busy={!gaveUp}>
      <ReelLogo size={64} loop={!gaveUp} />
      <h1 className={s.headline}>{t.processing}</h1>
      <p>{gaveUp ? t.stillMaking : t.processingSub(iso(view.fromName))}</p>
    </section>
  );
}

const REASONS = ["voice_or_likeness", "copyright", "hateful", "minor_sexual", "other"] as const;

// The Report sheet on every public page (gifts and Jugalbandi invites); endpoint is where it posts.
export function Report({ endpoint, lang, onClose }: { endpoint: string; lang: PageLang; onClose: () => void }) {
  const t = copy(lang);
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<(typeof REASONS)[number] | "">("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, details: form.get("details") ?? "", email: form.get("email") ?? "" }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) setDone(true);
    else setError(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Something went wrong. Try again.");
  }

  return (
    <dialog ref={dialog} className={s.sheet} onClose={onClose} aria-labelledby="report-title">
      <h2 id="report-title">{t.reportTitle}</h2>
      {done ? (
        <p role="status">{t.reportThanks}</p>
      ) : (
        <form onSubmit={send}>
          <fieldset className={s.reasons}>
            {REASONS.map((r) => (
              <label key={r}>
                <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} required />
                {t.reasons[r]}
              </label>
            ))}
          </fieldset>
          <label className={s.field}>
            {t.details}
            <textarea name="details" maxLength={500} rows={3} />
          </label>
          <label className={s.field}>
            {t.email}
            <input name="email" type="email" maxLength={200} dir="ltr" />
          </label>
          {error ? <p role="alert">{error}</p> : null}
          <button type="submit" disabled={!reason || busy}>
            {t.sendReport}
          </button>
        </form>
      )}
      <button type="button" className="ghost" onClick={() => dialog.current?.close()}>
        {t.close}
      </button>
    </dialog>
  );
}
