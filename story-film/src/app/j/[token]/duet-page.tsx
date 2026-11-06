"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import type { DuetView, Phase } from "@/lib/duets";
import { Report } from "../../g/[token]/gift-page";
import s from "../../g/[token]/gift.module.css";
import { ReelLogo } from "../../reel-logo";

interface Invite {
  starterName: string;
  topic: string;
  genre: string;
  phase: Phase;
  taken: boolean;
  expiresAt: string | null;
  half: number;
}

const MAX_SEC = 30;

function hoursLeft(iso: string | null): string {
  if (!iso) return "";
  const h = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 3600000));
  return h <= 1 ? "Closes within the hour" : `Open for ${h} more hours`;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((out as { error?: string }).error ?? "Something went wrong. Try again.");
  return out as T;
}

export function DuetPage({ token, signedIn, myName, view, invite }: { token: string; signedIn: boolean; myName: string; view: DuetView | null; invite: Invite }) {
  const router = useRouter();
  const [reporting, setReporting] = useState(false);
  const closed = invite.phase === "cancelled" || invite.phase === "solo" || invite.phase === "declined" || invite.phase === "expired";

  // While the song is being joined, look again every 10 s. "join_failed" too: it also shows for the
  // few seconds between the second part arriving and the song starting.
  useEffect(() => {
    if (view?.phase !== "joining" && view?.phase !== "join_failed") return;
    const t = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(t);
  }, [view?.phase, router]);

  let body;
  if (view?.role === "a") body = <Starter view={view} />;
  else if (view?.role === "b") body = <Partner view={view} token={token} />;
  else if (closed || invite.phase === "recording_a") body = <Closed text={`This invite has closed. Ask ${invite.starterName} to send a new one.`} />;
  else if (invite.taken) body = <Closed text={`Someone else is already singing with ${invite.starterName}.`} />;
  else body = <Join token={token} invite={invite} signedIn={signedIn} myName={myName} />;

  return (
    <div className={s.page} lang="en" dir="ltr">
      <header className={s.top}>
        <span className={s.brand}>
          <ReelLogo size={26} />
          Reelkar
        </span>
        <span className={s.aiPill}>Made with AI</span>
      </header>
      <main className={s.main}>{body}</main>
      <footer className={s.foot}>
        <span>Made with AI · Reelkar</span>
        <button type="button" className={s.linkBtn} onClick={() => setReporting(true)}>
          ⚑ Report
        </button>
      </footer>
      {reporting ? <Report endpoint={`/api/j/${token}/report`} lang="en" onClose={() => setReporting(false)} /> : null}
    </div>
  );
}

function Closed({ text }: { text: string }) {
  return (
    <section className={`${s.hero} ${s.center}`}>
      <p className={s.headline}>{text}</p>
      <a className={s.ghostBtn} href="/songs">
        Make your own song
      </a>
    </section>
  );
}

function Starter({ view }: { view: DuetView }) {
  return (
    <section className={`${s.hero} ${s.center}`}>
      <p className={s.overline}>Your Jugalbandi</p>
      <h1 className={s.headline}>{view.topic}</h1>
      <p>This is your invite link. Send it to the friend you want to sing with; follow along in the Reelkar app.</p>
      <a className={s.replyBtn} href={`https://wa.me/?text=${encodeURIComponent(`Sing a Jugalbandi with me on Reelkar 🎤 Hear my part: ${view.url}`)}`} target="_blank" rel="noreferrer" style={{ alignSelf: "stretch" }}>
        Send on WhatsApp
      </a>
    </section>
  );
}

// Not joined yet: hear the first part, then join (signing in first if needed).
function Join({ token, invite, signedIn, myName }: { token: string; invite: Invite; signedIn: boolean; myName: string }) {
  const router = useRouter();
  const [name, setName] = useState(myName);
  const [ig, setIg] = useState("");
  const [split, setSplit] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);

  async function join(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post(`/api/j/${token}/join`, { name, ig, split });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function decline() {
    setBusy(true);
    try {
      await post(`/api/j/${token}/decline`, { note });
      setDeclined(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (declined) return <Closed text={`Got it. We told ${invite.starterName}.`} />;
  return (
    <>
      <section className={s.hero}>
        <p className={s.overline}>Jugalbandi invite · {hoursLeft(invite.expiresAt)}</p>
        <h1 className={s.headline}>{invite.starterName} wants to sing a Jugalbandi with you</h1>
        <p style={{ margin: 0 }}>
          “{invite.topic}” · {invite.genre}
        </p>
        <div className={s.player} dir="ltr" style={{ color: "var(--ink)" }}>
          <audio controls preload="metadata" src={`/api/j/${token}/audio`} style={{ width: "100%" }} aria-label={`${invite.starterName}'s part`} />
        </div>
        <p style={{ margin: 0, fontSize: 14 }}>You sing the next part, about 30 seconds. AI joins both into one song, posted as an Instagram Collab once you both say yes.</p>
      </section>
      {!signedIn ? (
        <a className={s.replyBtn} href={`/login?next=${encodeURIComponent(`/j/${token}`)}`}>
          Sing your part here
        </a>
      ) : (
        <form onSubmit={join} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className={s.field}>
            Your name ({invite.starterName} sees it)
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required autoComplete="name" />
          </label>
          <label className={s.field}>
            Your Instagram username, for the Collab post (optional)
            <input value={ig} onChange={(e) => setIg(e.target.value)} maxLength={31} placeholder="@yourname" dir="ltr" autoCapitalize="off" />
          </label>
          <label style={{ display: "flex", gap: 10, alignItems: "center", minHeight: 44 }}>
            <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
            Offer to pay half ({invite.half} {invite.half === 1 ? "credit" : "credits"}). {invite.starterName} pays unless you offer.
          </label>
          {error ? (
            <div className={s.error} role="alert">
              {error} {/credits/.test(error) ? <a href="/billing">Get credits</a> : null}
            </div>
          ) : null}
          <button type="submit" className={s.replyBtn} disabled={busy || !name.trim()} style={{ border: 0, width: "100%" }}>
            Sing your part here
          </button>
          <p className={s.hint}>No app needed. Sung by an AI singer or your own voice, never {invite.starterName}&apos;s.</p>
        </form>
      )}
      {signedIn ? (
        declining ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label className={s.field}>
              A note for {invite.starterName} (optional)
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} />
            </label>
            <button type="button" className={s.ghostBtn} onClick={decline} disabled={busy}>
              Send “not this time”
            </button>
          </div>
        ) : (
          <button type="button" className={s.linkBtn} onClick={() => setDeclining(true)} style={{ alignSelf: "center" }}>
            Not this time
          </button>
        )
      ) : null}
    </>
  );
}

// Joined: sing (or sing again), wait for the join, then hear it and say yes.
function Partner({ view, token }: { view: DuetView; token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: string) {
    setBusy(true);
    setError(null);
    try {
      await post(`/api/duets/${view.id}/action`, { action });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (view.phase === "cancelled" || view.phase === "solo" || view.phase === "expired" || view.phase === "declined") {
    return <Closed text={`This Jugalbandi has closed. Ask ${view.starterName} to send a new invite.`} />;
  }
  if (view.phase === "recording_a") return <Closed text={`${view.starterName} is singing their part again. We'll be ready for you soon.`} />;
  if (!view.partB) return <Recorder view={view} token={token} />;
  if (view.phase === "joining") {
    return (
      <section className={`${s.hero} ${s.center}`} aria-busy="true">
        <ReelLogo size={64} loop />
        <h1 className={s.headline}>Joining your parts</h1>
        <p>About 2 minutes. You can leave; this page will have it.</p>
      </section>
    );
  }
  if (view.phase === "join_failed") {
    return <Closed text={`That didn't work. ${view.starterName} can try again; nothing more is charged.`} />;
  }
  const iApproved = view.approvedB;
  return (
    <>
      <section className={s.hero}>
        <p className={s.overline}>Your Jugalbandi with {view.starterName}</p>
        <h1 className={s.headline}>{view.topic}</h1>
        <div className={s.player} dir="ltr" style={{ color: "var(--ink)" }}>
          <audio controls preload="metadata" src={view.songAudioUrl ?? undefined} style={{ width: "100%" }} aria-label="Your Jugalbandi" />
        </div>
        <p style={{ margin: 0 }}>
          {view.starterName}: {view.approvedA ? "approved ✓" : "not yet"} · You: {iApproved ? "approved ✓" : "not yet"}
        </p>
      </section>
      {view.askedToRetake ? <div className={s.replyBanner}>{view.starterName} asked you to sing your part again.</div> : null}
      {error ? (
        <div className={s.error} role="alert">
          {error}
        </div>
      ) : null}
      {!iApproved ? (
        <button type="button" className={s.replyBtn} onClick={() => act("approve")} disabled={busy} style={{ border: 0 }}>
          Looks good, approve
        </button>
      ) : (
        <p className={s.hint}>{view.approvedA ? `${view.starterName} posts it as an Instagram Collab; you'll get the invite in Instagram.` : `Waiting for ${view.starterName} to approve.`}</p>
      )}
      <button type="button" className={s.ghostBtn} onClick={() => act("retake")} disabled={busy}>
        Sing my part again {view.freeRetake ? "(free)" : `(${view.retakeCredits} credit)`}
      </button>
    </>
  );
}

// Sing on the page: the browser's mic, up to 30 seconds, then the same upload as Hum it.
function Recorder({ view }: { view: DuetView; token: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "recording" | "review" | "sending">("idle");
  const [sec, setSec] = useState(0);
  const [clip, setClip] = useState<Blob | null>(null);
  const [withPart, setWithPart] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const theirs = useRef<HTMLAudioElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const url = clip ? URL.createObjectURL(clip) : null;

  useEffect(() => () => clearInterval(timer.current), []);

  async function start() {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Your browser blocked the mic. Allow it in the address bar, or open this link in Safari or Chrome.");
      return;
    }
    const type = ["audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
    const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => chunks.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      theirs.current?.pause();
      setClip(new Blob(chunks, { type: r.mimeType || type || "audio/webm" }));
      setState("review");
    };
    rec.current = r;
    r.start();
    setSec(0);
    setState("recording");
    if (withPart && theirs.current) {
      theirs.current.currentTime = 0;
      theirs.current.play().catch(() => undefined);
    }
    timer.current = setInterval(() => {
      setSec((x) => {
        if (x + 1 >= MAX_SEC) stop();
        return x + 1;
      });
    }, 1000);
  }

  function stop() {
    clearInterval(timer.current);
    if (rec.current?.state === "recording") rec.current.stop();
  }

  async function send() {
    if (!clip) return;
    setState("sending");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", clip, clip.type.includes("mp4") ? "part.m4a" : "part.webm");
      const res = await fetch("/api/voice/takes", { method: "POST", body: form });
      const take = (await res.json().catch(() => ({}))) as { takeId?: string; error?: string };
      if (!res.ok || !take.takeId) throw new Error(take.error ?? "Couldn't send that. Check your internet and try again.");
      await post(`/api/duets/${view.id}/part`, { takeId: take.takeId });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setState("review");
    }
  }

  return (
    <>
      <section className={s.hero}>
        <p className={s.overline}>Your part · Jugalbandi with {view.starterName}</p>
        <h1 className={s.headline}>{state === "recording" ? `Singing… 0:${String(sec).padStart(2, "0")} / 0:${MAX_SEC}` : "Sing your part"}</h1>
        <p style={{ margin: 0 }}>Answer {view.starterName} in your own words, sing, or just hum. About 30 seconds.</p>
        <div className={s.player} dir="ltr" style={{ color: "var(--ink)" }}>
          <audio ref={theirs} controls preload="metadata" src={view.partA?.audioUrl} style={{ width: "100%" }} aria-label={`${view.starterName}'s part`} />
        </div>
        <label style={{ display: "flex", gap: 10, alignItems: "center", minHeight: 44 }}>
          <input type="checkbox" checked={withPart} onChange={(e) => setWithPart(e.target.checked)} disabled={state === "recording"} />
          Play {view.starterName}&apos;s part while I sing (use earphones)
        </label>
      </section>
      {view.askedToRetake ? <div className={s.replyBanner}>{view.starterName} asked you to sing your part again.</div> : null}
      {error ? (
        <div className={s.error} role="alert">
          {error}
        </div>
      ) : null}
      {state === "idle" ? (
        <button type="button" className={s.replyBtn} onClick={start} style={{ border: 0 }}>
          🎤 Start singing
        </button>
      ) : state === "recording" ? (
        <button type="button" className={s.openBtn} onClick={stop} style={{ maxWidth: "none" }}>
          Stop
        </button>
      ) : (
        <>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- the singer's own take, just recorded */}
          {url ? <audio controls src={url} style={{ width: "100%" }} aria-label="Your take" /> : null}
          <button type="button" className={s.replyBtn} onClick={send} disabled={state === "sending"} style={{ border: 0 }}>
            {state === "sending" ? "Sending…" : "Send my part"}
          </button>
          <button type="button" className={s.ghostBtn} onClick={() => setState("idle")} disabled={state === "sending"}>
            Sing again
          </button>
        </>
      )}
      <p className={s.hint}>First time, your browser asks to use the mic. It only records while the timer runs.</p>
    </>
  );
}
