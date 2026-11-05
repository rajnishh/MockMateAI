"use client";

import { type FormEvent, useState } from "react";
import s from "../gift.module.css";

// A few styles that suit a song back; the full list is in Song Studio.
const GENRES = [
  { id: "bollywood-romantic", label: "Bollywood" },
  { id: "punjabi-pop", label: "Punjabi pop" },
  { id: "indie-acoustic", label: "Acoustic" },
  { id: "pop", label: "Pop" },
  { id: "sufi", label: "Sufi" },
  { id: "khaleeji", label: "Khaleeji" },
];
const LANGUAGES = [
  { code: "hinglish", label: "Hinglish" },
  { code: "hi", label: "हिन्दी" },
  { code: "en", label: "English" },
  { code: "ar", label: "العربية" },
];

export function ReplyForm({ token, to, occasion, free, price, language, myName }: { token: string; to: string; occasion: string; free: boolean; price: number; language: string; myName: string }) {
  const [topic, setTopic] = useState(`A thank-you song for ${to}`);
  const [genre, setGenre] = useState(GENRES[0].id);
  const [lang, setLang] = useState(language);
  const [fromName, setFromName] = useState(myName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; credits: boolean } | null>(null);

  async function make(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/songs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Sung by an AI singer: nobody can reply in the sender's own voice.
      body: JSON.stringify({ mode: "simple", topic, genre, language: lang, durationSec: 60, takes: 1, model: "ace-step", vocal: "auto", replyTo: token, fromName }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { gift?: { token: string }; error?: string; needCredits?: boolean } | null;
    if (res?.ok && body?.gift) {
      window.location.href = `/g/${body.gift.token}`;
      return;
    }
    setBusy(false);
    setError({ text: body?.error ?? "Something went wrong. Try again.", credits: Boolean(body?.needCredits) });
  }

  return (
    <div className={s.page}>
      <header className={s.top}>
        <a className={s.brand} href={`/g/${token}`} style={{ color: "inherit", textDecoration: "none" }}>
          ← Reply to {to}
        </a>
        <span className={s.aiPill}>Made with AI</span>
      </header>
      <main className={s.main}>
        <form onSubmit={make} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <section className={s.hero}>
            <p className={s.overline}>For {to} · {occasion} · Reply</p>
            <h1 className={s.headline}>Make a song back</h1>
            <p style={{ margin: 0 }}>Write one line. AI writes the words and sings it.</p>
          </section>
          <label className={s.field}>
            Your name ({to} sees it)
            <input value={fromName} onChange={(e) => setFromName(e.target.value)} maxLength={40} required autoComplete="name" />
          </label>
          <label className={s.field}>
            What&apos;s it about?
            <textarea value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={300} rows={3} required minLength={3} />
          </label>
          <fieldset className={s.reasons}>
            <legend>Style</legend>
            {GENRES.map((g) => (
              <label key={g.id}>
                <input type="radio" name="genre" checked={genre === g.id} onChange={() => setGenre(g.id)} />
                {g.label}
              </label>
            ))}
          </fieldset>
          <label className={s.field}>
            Language
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <p className={s.hint}>An AI singer sings it. You can use your own voice from the Reelkar app; {to}&apos;s voice can&apos;t be used.</p>
          {error ? (
            <div className={s.error} role="alert">
              {error.text} {error.credits ? <a href="/billing">Get credits</a> : null}
            </div>
          ) : null}
          <button type="submit" className={s.replyBtn} disabled={busy || topic.trim().length < 3 || !fromName.trim()} style={{ border: 0, width: "100%" }}>
            {busy ? "Making it…" : free ? "Make it · free" : `Make it · ${price} credits`}
          </button>
          <p className={s.hint}>{free ? "Your first reply is free. " : ""}About a minute. {to} gets it in Reelkar, and you get a link to send.</p>
        </form>
      </main>
    </div>
  );
}
